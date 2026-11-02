import SFTPClient from "ssh2-sftp-client"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import type { Destination } from "../types/config"
import { RetentionMode } from "../types/config"
import type { FileStat } from "../types/manifest"
import type { RemoteUsage } from "../types/destination"
import type { StoreResult, RestoreResult, RestoreSnapshot, RestoreSnapshotFile } from "@chest-backup/shared"
import type { RestoreDriverArgs, RestoreContext, FileOutcome, FileProgressCallback } from "../types/restore"
import { logger } from "../utils/logger"
import { speedFrom } from "../utils/upload"
import { normalizeBase, mirrorPathFor } from "../utils/mirror"
import { isPeriodKey } from "../backup/periods"
import { uploadFiles, deleteFiles, walkUsage } from "./engine"
import { enforceRemoteRetention, walkRemoteFiles, type RemoteFs } from "./remote-fs"
import { resolveTarget, skippedOutcome, restoredOutcome, dryRunOutcome, throttledReporter } from "../restore/transfer"

const makeDestLabel = (dest: Destination): string => {
  if (!dest.host) return dest.path
  return `sftp://${dest.user ?? "unknown"}@${dest.host}:${String(dest.port ?? 22)}${dest.path}`
}

const sftpFs = (sftp: SFTPClient): RemoteFs => ({
  list: (dir) => sftp.list(dir).then((entries) => entries.map((entry) => ({ name: entry.name, type: entry.type === "d" ? "dir" : "file", size: entry.size }))),
  removeFile: (path) => sftp.delete(path),
  removeDir: (dir) => sftp.rmdir(dir),
})

const connectClient = async (sftp: SFTPClient, dest: Destination): Promise<void> => {
  const config: SFTPClient.ConnectOptions = {
    host: dest.host,
    port: dest.port ?? 22,
    username: dest.user,
    readyTimeout: dest.timeout ?? 8_000,
  }
  if (dest.password) config.password = dest.password
  if (dest.privateKey) {
    const isPath = dest.privateKey.startsWith("/") || dest.privateKey.startsWith("~")
    const keyPath = isPath ? dest.privateKey.replace(/^~/, homedir()) : null
    config.privateKey = keyPath ? readFileSync(keyPath, "utf8") : dest.privateKey
  }
  try {
    await sftp.connect(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message || "no details (check host/port/credentials/firewall)" : String(err)
    throw new Error(`SFTP connection to ${makeDestLabel(dest)} failed: ${msg}`, { cause: err })
  }
}

const closeSftpQuietly = async (sftp: SFTPClient): Promise<void> => {
  await sftp.end().catch((err: unknown) => {
    logger.warn({ err }, "failed to close SFTP connection")
  })
}

const mkdirRecursive = async (sftp: SFTPClient, parts: string[], prefix: string): Promise<void> => {
  if (!parts.length) return
  const [head, ...rest] = parts
  const current = prefix ? `${prefix}/${head}` : `/${head}`
  try {
    await sftp.mkdir(current)
  } catch (err) {
    logger.debug({ dir: current, err }, "directory already exists")
  }
  await mkdirRecursive(sftp, rest, current)
}

const ensureRemoteDir = async (sftp: SFTPClient, remoteDir: string): Promise<void> => {
  const parts = remoteDir.split("/").filter(Boolean)
  await mkdirRecursive(sftp, parts, "")
}

const storeSftpIncremental = async (files: FileStat[], toDelete: string[], dest: Destination, periodKey: string): Promise<StoreResult> => {
  if (!dest.host || !dest.user) return { success: false, error: "SFTP destination missing host or user" }
  const sftp = new SFTPClient()
  try {
    await connectClient(sftp, dest)
    const base = mirrorPathFor(normalizeBase(dest.path), periodKey)
    await ensureRemoteDir(sftp, normalizeBase(dest.path))
    await ensureRemoteDir(sftp, base)
    const upload = await uploadFiles({ files, base, destLabel: makeDestLabel(dest), ensureDir: (dir) => ensureRemoteDir(sftp, dir), uploadFile: (src, remote) => sftp.fastPut(src, remote, { concurrency: 64, chunkSize: 262_144 }) })
    const removal = await deleteFiles({ toDelete, base, deleteFile: (remote) => sftp.delete(remote) })
    const speed = speedFrom(upload.totalUploaded, upload.totalDuration)
    logger.info(
      { dest: makeDestLabel(dest), uploaded: upload.uploaded.length, deleted: removal.deleted.length, failed: upload.failed.length },
      "SFTP incremental sync complete",
    )
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
    logger.error({ dest: makeDestLabel(dest), error: msg }, "SFTP incremental upload failed")
    return { success: false, error: msg }
  } finally {
    await closeSftpQuietly(sftp)
  }
}

const scanSftpUsage = async (dest: Destination): Promise<RemoteUsage | null> => {
  const sftp = new SFTPClient()
  try {
    await connectClient(sftp, dest)
    const base = normalizeBase(dest.path)
    if (!(await sftp.exists(base))) return { totalSize: 0, fileCount: 0 }
    return await walkUsage(sftpFs(sftp).list, base)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ host: dest.host, path: dest.path, error: msg }, "failed to scan SFTP destination")
    return null
  } finally {
    await closeSftpQuietly(sftp)
  }
}

const enforceRetentionSftp = async (dest: Destination, globalRetention: number, mode: RetentionMode, periodKey: string): Promise<void> => {
  if (!dest.host || !dest.user) return
  const sftp = new SFTPClient()
  try {
    await connectClient(sftp, dest)
    await enforceRemoteRetention(sftpFs(sftp), normalizeBase(dest.path), globalRetention, mode, periodKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ path: dest.path, error: msg }, "SFTP retention failed")
  } finally {
    await closeSftpQuietly(sftp)
  }
}

const listSftpSnapshots = async (dest: Destination, mode: RetentionMode): Promise<RestoreSnapshot[]> => {
  const sftp = new SFTPClient()
  try {
    await connectClient(sftp, dest)
    const base = normalizeBase(dest.path)
    if (!(await sftp.exists(base))) return []
    const entries = await sftp.list(base)
    return entries
      .filter((entry) => entry.type === "d" && isPeriodKey(mode, entry.name))
      .map((entry) => ({
        key: entry.name,
        fileCount: null,
        totalSize: null,
        ...(entry.modifyTime ? { createdAt: new Date(entry.modifyTime).toISOString() } : {}),
      }))
      .sort((a, b) => b.key.localeCompare(a.key))
  } finally {
    await closeSftpQuietly(sftp)
  }
}

const listSftpFiles = async (dest: Destination, periodKey: string): Promise<RestoreSnapshotFile[]> => {
  if (!dest.host || !dest.user) throw new Error("SFTP destination missing host or user")
  const sftp = new SFTPClient()
  try {
    await connectClient(sftp, dest)
    const root = `${normalizeBase(dest.path)}/${periodKey}`
    const files: RestoreSnapshotFile[] = []
    await walkRemoteFiles(sftpFs(sftp), root, root, files)
    return files.sort((a, b) => a.path.localeCompare(b.path))
  } finally {
    await closeSftpQuietly(sftp)
  }
}

const fetchSftpFile = async (sftp: SFTPClient, sourceRoot: string, file: RestoreSnapshotFile, context: RestoreContext, onFileProgress: FileProgressCallback): Promise<FileOutcome> => {
  const { target, skipped } = await resolveTarget(file, context)
  if (skipped) return skippedOutcome(file.path, target, file.size)
  const report = throttledReporter(onFileProgress, file.size)
  await sftp.fastGet(`${sourceRoot}/${file.path}`, target, { concurrency: 64, chunkSize: 262_144, step: (transferred) => report(transferred, file.size) })
  report(file.size, file.size)
  return restoredOutcome(file.path, target, file.size)
}

const restoreSftp = async (args: RestoreDriverArgs): Promise<RestoreResult> => {
  const sftp = new SFTPClient()
  try {
    await connectClient(sftp, args.dest)
    const sourceRoot = `${normalizeBase(args.dest.path)}/${args.periodKey}`
    return await args.restoreWithHandler((file, onFileProgress) =>
      args.context.dryRun ? dryRunOutcome(file, args.context) : fetchSftpFile(sftp, sourceRoot, file, args.context, onFileProgress),
    )
  } finally {
    await closeSftpQuietly(sftp)
  }
}

export { storeSftpIncremental, scanSftpUsage, enforceRetentionSftp, listSftpSnapshots, listSftpFiles, restoreSftp }
