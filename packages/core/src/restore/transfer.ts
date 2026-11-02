import { createReadStream, createWriteStream } from "node:fs"
import { chmod, lstat, mkdir, stat, utimes } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { pipeline } from "node:stream/promises"
import { RestoreFileStatus, type RestoreSnapshotFile } from "@chest-backup/shared"
import type { RestoreContext, FileOutcome, TargetResolution, FileProgressCallback, FileProgressReporter } from "../types/restore"
import { logger } from "../utils/logger"

const PROGRESS_THROTTLE_MS = 200

const normalizeRelative = (path: string): string => path.replace(/\\/g, "/").replace(/^\/+/, "")

const isSafeRelative = (path: string): boolean =>
  path.length > 0 &&
  path
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..")

const targetPathFor = (root: string, relative: string): string => {
  if (!isSafeRelative(relative)) throw new Error(`Unsafe snapshot path: ${relative}`)
  const target = resolve(root, ...relative.split("/"))
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error(`Path escapes restore root: ${relative}`)
  return target
}

const assertTargetWritable = async (target: string, overwrite: boolean): Promise<void> => {
  const existing = await lstat(target).catch(() => null)
  if (!existing) return
  if (existing.isDirectory()) throw new Error("target is a directory")
  if (existing.isSymbolicLink() && !(await stat(target).catch(() => null))) throw new Error("target is a broken symlink")
  if (!overwrite) throw new Error("target exists")
}

const preserveMetadata = async (source: string, target: string): Promise<void> => {
  try {
    const sourceStat = await stat(source)
    await chmod(target, sourceStat.mode)
    await utimes(target, sourceStat.atime, sourceStat.mtime)
  } catch (err) {
    logger.debug({ source, err }, "failed to preserve file metadata after restore")
  }
}

const skippedOutcome = (path: string, target: string, size: number): FileOutcome => ({
  result: { path, target, size, status: RestoreFileStatus.Skipped },
  bytes: 0,
})

const restoredOutcome = (path: string, target: string, size: number): FileOutcome => ({
  result: { path, target, size, status: RestoreFileStatus.Restored },
  bytes: size,
})

const isSkipped = async (target: string, overwrite: boolean): Promise<boolean> => {
  try {
    await assertTargetWritable(target, overwrite)
    return false
  } catch (err) {
    logger.debug({ target, err }, "target not writable, skipping file")
    return true
  }
}

const resolveTarget = async (file: RestoreSnapshotFile, context: RestoreContext): Promise<TargetResolution> => {
  const target = targetPathFor(context.targetRoot, file.path)
  if (await isSkipped(target, context.overwrite)) return { target, skipped: true }
  await mkdir(dirname(target), { recursive: true })
  return { target, skipped: false }
}

const dryRunOutcome = async (file: RestoreSnapshotFile, context: RestoreContext): Promise<FileOutcome> => {
  const target = targetPathFor(context.targetRoot, file.path)
  return (await isSkipped(target, context.overwrite)) ? skippedOutcome(file.path, target, file.size) : restoredOutcome(file.path, target, file.size)
}

const throttledReporter = (onFileProgress: FileProgressCallback, total: number): FileProgressReporter => {
  let lastAt = 0
  return (transferred, fileTotal) => {
    const now = Date.now()
    if (transferred < total && now - lastAt < PROGRESS_THROTTLE_MS) return transferred
    lastAt = now
    onFileProgress(transferred, fileTotal)
    return transferred
  }
}

const appendChunkToFile = async (target: string, chunk: Buffer): Promise<void> => {
  const stream = createWriteStream(target, { flags: "a" })
  await new Promise<void>((resolvePromise, rejectPromise) => {
    stream.on("open", () => {
      resolvePromise()
    })
    stream.on("error", (err: Error) => {
      rejectPromise(err)
    })
    stream.end(chunk)
  })
}

const copyWithProgress = async (source: string, target: string, total: number, onFileProgress: FileProgressCallback): Promise<void> => {
  const report = throttledReporter(onFileProgress, total)
  const reader = createReadStream(source)
  reader.on("data", () => report(reader.bytesRead, total))
  await pipeline(reader, createWriteStream(target))
  report(total, total)
}

const copyLocalFile = async (sourceRoot: string, file: RestoreSnapshotFile, context: RestoreContext, onFileProgress: FileProgressCallback): Promise<FileOutcome> => {
  const { target, skipped } = await resolveTarget(file, context)
  if (skipped) return skippedOutcome(file.path, target, file.size)
  const source = join(sourceRoot, file.path)
  await copyWithProgress(source, target, file.size, onFileProgress)
  await preserveMetadata(source, target)
  return restoredOutcome(file.path, target, file.size)
}

const restoreLocalFile = async (sourceRoot: string, file: RestoreSnapshotFile, context: RestoreContext, onFileProgress: FileProgressCallback): Promise<FileOutcome> =>
  (context.dryRun ? dryRunOutcome(file, context) : copyLocalFile(sourceRoot, file, context, onFileProgress))

export { normalizeRelative, isSafeRelative, targetPathFor, resolveTarget, skippedOutcome, restoredOutcome, dryRunOutcome, throttledReporter, appendChunkToFile, restoreLocalFile }
