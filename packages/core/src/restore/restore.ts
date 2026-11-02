import { join, resolve } from "node:path"
import { speedFor } from "../utils/upload"
import {
  DestinationType,
  RestorePhase,
  RestoreFileStatus,
  type RestoreFileResult,
  type RestoreOptions,
  type RestoreProgressEvent,
  type RestoreResult,
  type RestoreSnapshotFile,
} from "@chest-backup/shared"
import type { Destination } from "../types/config"
import type {
  RestoreContext,
  FileOutcome,
  RestoreCounters,
  ProgressTotals,
  RestoreProgressCallback,
  FileProgressArgs,
  RestoreRunArgs,
  ProcessFilesArgs,
  FileSelection,
  RestoreHandlerArgs,
  RestoreDriverArgs,
} from "../types/restore"
import { getDriver } from "../destinations/drivers"
import { normalizeBase } from "../utils/mirror"
import { logger } from "../utils/logger"
import { SFTP_SCAN_TIMEOUT_MS, withTimeout } from "../utils/timeout"
import { listSnapshotFiles } from "./snapshots"
import { isSafeRelative, normalizeRelative, restoreLocalFile, targetPathFor } from "./transfer"

const selectFiles = (available: RestoreSnapshotFile[], requested: string[] | undefined): FileSelection => {
  if (!requested) return { selected: available, missing: [] }
  const wanted = new Set(requested.map(normalizeRelative))
  const selected = available.filter((file) => wanted.has(file.path))
  const found = new Set(selected.map((file) => file.path))
  return { selected, missing: [...wanted].filter((path) => !found.has(path)) }
}
const toFailure = (path: string, targetRoot: string, error: string): RestoreFileResult => ({
  path,
  target: isSafeRelative(path) ? targetPathFor(targetRoot, path) : path,
  size: 0,
  status: RestoreFileStatus.Failed,
  error,
})
const failureOutcome = (file: RestoreSnapshotFile, targetRoot: string, error: string): FileOutcome => ({
  result: { ...toFailure(file.path, targetRoot, error), size: file.size },
  bytes: 0,
})
const runFile = async (file: RestoreSnapshotFile, context: RestoreContext, restore: () => Promise<FileOutcome>): Promise<FileOutcome> => {
  try {
    return await restore()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ path: file.path, err }, "restore failed for file")
    return failureOutcome(file, context.targetRoot, message)
  }
}
const emitProgress = (onProgress: RestoreProgressCallback | undefined, event: Omit<RestoreProgressEvent, "phase">): void => {
  onProgress?.({ ...event, phase: RestorePhase.Restoring })
}
const progressTotals = (files: RestoreSnapshotFile[], missing: string[]): ProgressTotals => ({
  totalFiles: files.length + missing.length,
  totalBytes: files.reduce((acc, file) => acc + file.size, 0),
  missingErrors: missing.map((path) => `File not present in snapshot: ${path}`),
})
const tallyOutcome = (counts: RestoreCounters, outcome: FileOutcome): void => {
  if (outcome.result.status === RestoreFileStatus.Restored) counts.restored += 1
  if (outcome.result.status === RestoreFileStatus.Skipped) counts.skipped += 1
  if (outcome.result.status === RestoreFileStatus.Failed) counts.failed += 1
  counts.bytes += outcome.bytes
}
const emitFileProgress = (args: FileProgressArgs): void => {
  const bytes = args.counts.bytes + args.transferred
  emitProgress(args.onProgress, {
    totalFiles: args.totals.totalFiles,
    completedFiles: args.counts.completed,
    restoredCount: args.counts.restored,
    skippedCount: args.counts.skipped,
    failedCount: args.counts.failed,
    restoredBytes: bytes,
    currentPath: args.file.path,
    currentFileBytes: args.transferred,
    currentFileTotal: args.total,
    speed: speedFor(bytes, args.startedAt),
  })
}
const missingResults = (missing: string[], targetRoot: string): RestoreFileResult[] =>
  missing.map((path) => toFailure(path, targetRoot, "File not present in snapshot"))
const freshCounters = (missingCount: number): RestoreCounters => ({ completed: missingCount, restored: 0, skipped: 0, failed: missingCount, bytes: 0 })
const failedErrorsOf = (results: RestoreFileResult[]): string[] =>
  results.filter((result) => result.status === RestoreFileStatus.Failed && result.error).map((result) => `${result.path}: ${result.error ?? "unknown error"}`)
const processOneFile = async (args: ProcessFilesArgs, file: RestoreSnapshotFile): Promise<void> => {
  const progress = { onProgress: args.onProgress, totals: args.totals, counts: args.counts, file, startedAt: args.startedAt }
  const outcome = await runFile(file, args.context, () =>
    args.handler(file, (transferred, total) => {
      emitFileProgress({ ...progress, transferred, total })
    }),
  )
  args.results.push(outcome.result)
  args.counts.completed += 1
  tallyOutcome(args.counts, outcome)
  emitFileProgress({ ...progress, transferred: 0, total: 0 })
}
const processFiles = async (args: ProcessFilesArgs): Promise<void> => {
  for (const file of args.files) {
    if (args.signal.aborted) return
    await processOneFile(args, file)
  }
}
const buildResult = (results: RestoreFileResult[], totals: ProgressTotals, counts: RestoreCounters, startedAt: number): RestoreResult => ({
  success: counts.failed === 0, files: results, restoredCount: counts.restored, skippedCount: counts.skipped, failedCount: counts.failed,
  totalFiles: totals.totalFiles, totalBytes: totals.totalBytes, restoredBytes: counts.bytes, durationMs: Date.now() - startedAt,
  errors: [...totals.missingErrors, ...failedErrorsOf(results)],
})
const restoreWithHandler = async (args: RestoreHandlerArgs): Promise<RestoreResult> => {
  const startedAt = Date.now()
  const processArgs: ProcessFilesArgs = {
    ...args,
    totals: progressTotals(args.files, args.missing),
    counts: freshCounters(args.missing.length),
    results: missingResults(args.missing, args.context.targetRoot),
    startedAt,
  }
  await processFiles(processArgs)
  const result = buildResult(processArgs.results, processArgs.totals, processArgs.counts, startedAt)
  logger.info({ restored: processArgs.counts.restored, skipped: processArgs.counts.skipped, failed: processArgs.counts.failed, totalFiles: processArgs.totals.totalFiles, restoredBytes: processArgs.counts.bytes, durationMs: result.durationMs }, "snapshot restore finished")
  return result
}
const restoreLocal = (args: RestoreRunArgs): Promise<RestoreResult> =>
  restoreWithHandler({
    ...args,
    handler: (file, onFileProgress) => restoreLocalFile(join(normalizeBase(args.dest.path), args.periodKey), file, args.context, onFileProgress),
  })
const buildDriverArgs = (args: RestoreRunArgs): RestoreDriverArgs => ({
  dest: args.dest,
  periodKey: args.periodKey,
  files: args.files,
  context: args.context,
  restoreWithHandler: (handler) => restoreWithHandler({ ...args, handler }),
})
const createContext = (options: RestoreOptions): RestoreContext => ({
  targetRoot: resolve(options.targetRoot?.trim() || "/"),
  overwrite: options.overwrite ?? true,
  dryRun: options.dryRun ?? false,
})
const listSnapshotFilesWithTimeout = (dest: Destination, periodKey: string): Promise<RestoreSnapshotFile[]> =>
  withTimeout(listSnapshotFiles(dest, periodKey), SFTP_SCAN_TIMEOUT_MS, [])
const restoreSnapshot = async (dest: Destination, periodKey: string, options: RestoreOptions = {}, controller: AbortController, onProgress?: RestoreProgressCallback): Promise<RestoreResult> => {
  const available = await listSnapshotFilesWithTimeout(dest, periodKey)
  const selection = selectFiles(available, options.files)
  const args: RestoreRunArgs = { dest, periodKey, files: selection.selected, missing: selection.missing, context: createContext(options), signal: controller.signal, onProgress }
  logger.info({ destination: dest.name ?? dest.path, period: periodKey, files: args.files.length, missing: args.missing.length, targetRoot: args.context.targetRoot, overwrite: args.context.overwrite, dryRun: args.context.dryRun }, "snapshot restore started")
  emitProgress(args.onProgress, {
    totalFiles: args.files.length + args.missing.length,
    completedFiles: 0,
    restoredCount: 0,
    skippedCount: 0,
    failedCount: 0,
    restoredBytes: 0,
    currentFileBytes: 0,
    currentFileTotal: 0,
    speed: 0,
  })
  if (dest.type === DestinationType.Local) return restoreLocal(args)
  return getDriver(dest.type).restore(buildDriverArgs(args))
}

export { restoreSnapshot }
