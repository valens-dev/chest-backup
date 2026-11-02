import { statSync } from "node:fs"
import type { FileStat } from "../types/manifest"
import type { DeleteOutcome, FileUploadResult, UploadOutcome, RemoteUsage } from "../types/destination"
import { UploadOutcomeKind } from "../types/destination"
import { logger } from "../utils/logger"
import { errorCode, isRetryable, partitionByOutcome } from "../utils/upload"
import { cleanRelativePath, mirrorPathFor } from "../utils/mirror"

const RETRY_DELAY_MS = 1_000
const MAX_UPLOAD_ATTEMPTS = 3

type SleepFn = (ms: number) => Promise<void>

const sleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const sourceStillExists = (filePath: string): boolean => statSync(filePath, { throwIfNoEntry: false }) !== undefined

const outcomeFromError = (err: unknown, filePath: string, destLabel: string): FileUploadResult => {
  const vanished = errorCode(err) === "ENOENT" && !sourceStillExists(filePath)
  if (vanished) {
    logger.warn({ src: filePath }, `source file vanished during ${destLabel} upload, skipping`)
    return { path: filePath, outcome: UploadOutcomeKind.Vanished }
  }
  logger.error({ src: filePath, err }, `${destLabel} upload failed`)
  return { path: filePath, outcome: UploadOutcomeKind.Failed }
}

const handleUploadFailure = async (file: FileStat, err: unknown, attempt: number, destLabel: string): Promise<FileUploadResult | null> => {
  if (!isRetryable(err)) return outcomeFromError(err, file.path, destLabel)
  if (attempt === MAX_UPLOAD_ATTEMPTS) return null
  logger.warn({ src: file.path, attempt }, `retrying ${destLabel} upload after transient error`)
  await sleep(RETRY_DELAY_MS * attempt)
  return null
}

const remoteDirFor = (base: string, relativePath: string): string => {
  const parts = relativePath.split("/")
  parts.pop()
  return [base, ...parts].join("/")
}

interface UploadLoopArgs {
  files: FileStat[]
  base: string
  destLabel: string
  ensureDir: (remoteDir: string) => Promise<void>
  uploadFile: (filePath: string, remotePath: string) => Promise<unknown>
}

const uploadOneFile = async (args: UploadLoopArgs, file: FileStat): Promise<FileUploadResult> => {
  const remotePath = mirrorPathFor(args.base, file.relativePath)
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      await timedUpload(args, file.path, remotePath)
      return { path: file.path, outcome: UploadOutcomeKind.Uploaded }
    } catch (err) {
      lastError = err
      const terminal = await handleUploadFailure(file, err, attempt, args.destLabel)
      if (terminal) return terminal
    }
  }
  return outcomeFromError(lastError, file.path, args.destLabel)
}

const timedUpload = async (args: UploadLoopArgs, filePath: string, remotePath: string): Promise<void> => {
  const fileSize = statSync(filePath).size
  const startTime = Date.now()
  logger.info({ remotePath, size: fileSize }, "uploading file to destination")
  await args.uploadFile(filePath, remotePath)
  const durationMs = Date.now() - startTime
  if (durationMs > 0) logger.debug({ remotePath, speed: fileSize / (durationMs / 1000) }, "upload speed")
}

const ensureDirOnce = async (createdDirs: Set<string>, ensureDir: (remoteDir: string) => Promise<void>, remoteDir: string): Promise<void> => {
  if (createdDirs.has(remoteDir)) return
  try {
    await ensureDir(remoteDir)
  } catch (err) {
    logger.debug({ dir: remoteDir, err }, "directory already exists")
  }
  createdDirs.add(remoteDir)
}

const uploadFiles = async (args: UploadLoopArgs): Promise<UploadOutcome> => {
  const createdDirs = new Set<string>([args.base])
  const results: FileUploadResult[] = []
  const sizeByPath = new Map(args.files.map((f) => [f.path, f.size]))
  const startTime = Date.now()

  for (const file of args.files) {
    const rel = cleanRelativePath(file.relativePath)
    await ensureDirOnce(createdDirs, args.ensureDir, remoteDirFor(args.base, rel))
    results.push(await uploadOneFile(args, file))
  }
  const { uploaded, failed, vanished } = partitionByOutcome(results)
  const totalUploaded = uploaded.reduce((acc, path) => acc + (sizeByPath.get(path) ?? 0), 0)
  logger.info({ uploaded: uploaded.length, failed: failed.length, vanished: vanished.length }, "file upload pass complete")
  return { uploaded, failed, vanished, totalUploaded, totalDuration: Date.now() - startTime }
}

interface DeleteLoopArgs {
  toDelete: string[]
  base: string
  deleteFile: (remotePath: string) => Promise<unknown>
}

const deleteRemoteFile = async (args: DeleteLoopArgs, relativePath: string): Promise<string | null> => {
  try {
    await args.deleteFile(mirrorPathFor(args.base, relativePath))
    return relativePath
  } catch (err) {
    logger.debug({ relativePath, err }, "remote file not found during incremental cleanup")
    return null
  }
}

const deleteFiles = async (args: DeleteLoopArgs): Promise<DeleteOutcome> => {
  const results = await Promise.all(args.toDelete.map((rel) => deleteRemoteFile(args, rel)))
  const deleted = results.filter((r): r is string => r !== null)
  return { deleted, failed: args.toDelete.length - deleted.length }
}

type UsageEntry = { name: string; type: "file" | "dir"; size: number }

const walkUsage = async (listDir: (dir: string) => Promise<UsageEntry[]>, base: string): Promise<RemoteUsage> => {
  const entries = await listDir(base).catch((err: unknown) => {
    logger.debug({ dir: base, err }, "usage scan directory listing failed")
    return [] as UsageEntry[]
  })
  const files = entries.filter((e) => e.type === "file")
  const subdirs = entries.filter((e) => e.type === "dir").map((e) => `${base}/${e.name}`)
  const nested = await Promise.all(subdirs.map((sub) => walkUsage(listDir, sub)))
  const totalSize = files.reduce((acc, f) => acc + f.size, 0) + nested.reduce((acc, u) => acc + u.totalSize, 0)
  return { totalSize, fileCount: files.length + nested.reduce((acc, u) => acc + u.fileCount, 0) }
}

export { uploadFiles, deleteFiles, walkUsage }
