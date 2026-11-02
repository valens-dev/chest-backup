import { readFileSync } from "node:fs"
import { S3Client, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3"
import type { Destination } from "../types/config"
import { RetentionMode } from "../types/config"
import type { FileStat } from "../types/manifest"
import type { RemoteUsage } from "../types/destination"
import type { StoreResult, RestoreResult, RestoreSnapshot, RestoreSnapshotFile } from "@chest-backup/shared"
import type { RestoreDriverArgs, RestoreContext, FileOutcome, FileProgressCallback } from "../types/restore"
import { logger } from "../utils/logger"
import { speedFrom } from "../utils/upload"
import { normalizeBase, mirrorPathFor, cleanRelativePath } from "../utils/mirror"
import { isPeriodKey, selectExpiredPeriodKeys } from "../backup/periods"
import { uploadFiles, deleteFiles } from "./engine"
import { resolveTarget, skippedOutcome, restoredOutcome, dryRunOutcome, appendChunkToFile } from "../restore/transfer"

type S3ObjectKey = { key: string; size: number }

const LIST_PAGE_SIZE = 1_000

const basePathOf = (path: string): string => cleanRelativePath(normalizeBase(path))

const makeDestLabel = (dest: Destination): string => `s3://${cleanRelativePath(dest.path)}`

const buildClient = (dest: Destination): S3Client => {
  const endpoint = `http://${dest.host ?? "unknown"}:${String(dest.port ?? 80)}`
  return new S3Client({
    region: dest.region || "us-east-1",
    credentials: { accessKeyId: dest.accessKeyId ?? "", secretAccessKey: dest.secretAccessKey ?? "" },
    endpoint,
    forcePathStyle: true,
  })
}

const bucketNameOf = (path: string): string => cleanRelativePath(path).split("/")[0]

const ensureBucket = async (client: S3Client, bucket: string): Promise<void> => {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (err) {
    logger.debug({ bucket, err }, "S3 bucket not found")
    throw new Error(`S3 bucket "${bucket}" does not exist or is not accessible`, { cause: err })
  }
}

const paginateKeys = async (client: S3Client, bucket: string, prefix: string): Promise<S3ObjectKey[]> => {
  const out: S3ObjectKey[] = []
  let continuationToken: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: LIST_PAGE_SIZE, ContinuationToken: continuationToken }))
    for (const obj of page.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith("/")) continue
      out.push({ key: obj.Key, size: obj.Size ?? 0 })
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return out
}

const paginateCommonPrefixes = async (client: S3Client, bucket: string, base: string): Promise<string[]> => {
  const prefixes = new Set<string>()
  let continuationToken: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${base}/`, Delimiter: "/", MaxKeys: LIST_PAGE_SIZE, ContinuationToken: continuationToken }))
    for (const prefix of page.CommonPrefixes ?? []) {
      if (prefix.Prefix) prefixes.add(prefix.Prefix.slice(base.length + 1, -(prefix.Prefix.endsWith("/") ? 1 : 0)))
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)
  return [...prefixes]
}

const removePeriodFolder = async (client: S3Client, bucket: string, base: string, periodKey: string): Promise<void> => {
  const keys = await paginateKeys(client, bucket, `${base}/${periodKey}/`)
  if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((key) => ({ Key: key.key })) } }))
  logger.info({ dir: `${base}/${periodKey}`, deleted: keys.length }, "deleted expired snapshot folder via S3 for retention")
}

const storeS3Incremental = async (files: FileStat[], toDelete: string[], dest: Destination, periodKey: string): Promise<StoreResult> => {
  if (!dest.host || !dest.accessKeyId || !dest.secretAccessKey) return { success: false, error: "S3 destination missing host, access key id or secret access key" }
  const client = buildClient(dest)
  const bucket = bucketNameOf(dest.path)
  try {
    await ensureBucket(client, bucket)
    const base = mirrorPathFor(basePathOf(dest.path), periodKey)
    const upload = await uploadFiles({
      files,
      base,
      destLabel: makeDestLabel(dest),
      ensureDir: () => Promise.resolve(),
      uploadFile: async (filePath, remotePath) => client.send(new PutObjectCommand({ Bucket: bucket, Key: remotePath, Body: readFileSync(filePath) })),
    })
    const removal = await deleteFiles({ toDelete, base, deleteFile: (remotePath) => client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: remotePath }] } })) })
    const speed = speedFrom(upload.totalUploaded, upload.totalDuration)
    logger.info({ dest: makeDestLabel(dest), uploaded: upload.uploaded.length, deleted: removal.deleted.length, failed: upload.failed.length }, "S3 incremental sync complete")
    return {
      success: upload.failed.length === 0,
      uploaded: upload.uploaded,
      deleted: removal.deleted,
      failedCount: upload.failed.length,
      vanishedCount: upload.vanished.length,
      speed,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message || "no details" : String(err)
    logger.error({ dest: makeDestLabel(dest), error: msg }, "S3 incremental upload failed")
    return { success: false, error: msg }
  }
}

const scanS3Usage = async (dest: Destination): Promise<RemoteUsage | null> => {
  const client = buildClient(dest)
  const bucket = bucketNameOf(dest.path)
  try {
    await ensureBucket(client, bucket)
    const base = basePathOf(dest.path)
    const entries = await paginateKeys(client, bucket, `${base}/`)
    return { totalSize: entries.reduce((acc, e) => acc + e.size, 0), fileCount: entries.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ host: dest.host, path: dest.path, error: msg }, "failed to scan S3 destination")
    return null
  }
}

const enforceRetentionS3 = async (dest: Destination, globalRetention: number, mode: RetentionMode, periodKey: string): Promise<void> => {
  if (!dest.host || !dest.accessKeyId || !dest.secretAccessKey) return
  if (mode === RetentionMode.Forever) {
    logger.debug({ dest: dest.path, periodKey }, "retention disabled, keeping all snapshot folders")
    return
  }
  const retention = Math.max(globalRetention, 1)
  const client = buildClient(dest)
  const bucket = bucketNameOf(dest.path)
  const base = basePathOf(dest.path)
  try {
    const folders = await paginateCommonPrefixes(client, bucket, base)
    const expired = selectExpiredPeriodKeys(folders.filter((name) => isPeriodKey(mode, name)), retention, periodKey, (name) => isPeriodKey(mode, name))
    for (const key of expired) await removePeriodFolder(client, bucket, base, key)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ path: dest.path, error: msg }, "S3 retention failed")
  }
}

const listS3Snapshots = async (dest: Destination, mode: RetentionMode): Promise<RestoreSnapshot[]> => {
  const client = buildClient(dest)
  const bucket = bucketNameOf(dest.path)
  const base = basePathOf(dest.path)
  const keys = await paginateCommonPrefixes(client, bucket, base)
  return keys.filter((key) => isPeriodKey(mode, key)).map((key) => ({ key, fileCount: null, totalSize: null })).sort((a, b) => b.key.localeCompare(a.key))
}

const listS3Files = async (dest: Destination, periodKey: string): Promise<RestoreSnapshotFile[]> => {
  const client = buildClient(dest)
  const bucket = bucketNameOf(dest.path)
  const prefix = `${basePathOf(dest.path)}/${periodKey}/`
  return paginateKeys(client, bucket, prefix)
    .then((keys) => keys.map((key) => ({ path: key.key.slice(prefix.length), size: key.size })))
    .then((files) => files.sort((a, b) => a.path.localeCompare(b.path)))
}

const fetchS3File = async (client: S3Client, bucket: string, dest: Destination, periodKey: string, file: RestoreSnapshotFile, context: RestoreContext, onFileProgress: FileProgressCallback): Promise<FileOutcome> => {
  const { target, skipped } = await resolveTarget(file, context)
  if (skipped) return skippedOutcome(file.path, target, file.size)
  const s3Base = basePathOf(dest.path)
  const key = `${s3Base}/${periodKey}/${file.path}`
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = response.Body
  if (!body) throw new Error("S3 object has no body")
  let transferred = 0
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk)
    transferred += buffer.length
    onFileProgress(transferred, file.size)
    await appendChunkToFile(target, buffer)
  }
  onFileProgress(file.size, file.size)
  return restoredOutcome(file.path, target, file.size)
}

const restoreS3 = async (args: RestoreDriverArgs): Promise<RestoreResult> => {
  const client = buildClient(args.dest)
  const bucket = bucketNameOf(args.dest.path)
  return args.restoreWithHandler((file, onFileProgress) =>
    args.context.dryRun ? dryRunOutcome(file, args.context) : fetchS3File(client, bucket, args.dest, args.periodKey, file, args.context, onFileProgress),
  )
}

export { storeS3Incremental, scanS3Usage, enforceRetentionS3, listS3Snapshots, listS3Files, restoreS3 }
