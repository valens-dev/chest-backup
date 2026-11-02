import type { RestoreFileResult, RestoreProgressEvent, RestoreResult, RestoreSnapshotFile } from "@chest-backup/shared"
import type { Destination } from "./config"

interface RestoreContext {
  targetRoot: string
  overwrite: boolean
  dryRun: boolean
}

interface FileOutcome {
  result: RestoreFileResult
  bytes: number
}

interface TargetResolution {
  target: string
  skipped: boolean
}

interface RestoreCounters {
  completed: number
  restored: number
  skipped: number
  failed: number
  bytes: number
}

interface ProgressTotals {
  totalFiles: number
  totalBytes: number
  missingErrors: string[]
}

type RestoreProgressCallback = (event: RestoreProgressEvent) => void

type FileProgressCallback = (transferred: number, total: number) => void

type FileProgressReporter = (transferred: number, total: number) => number

type FileRestoreHandler = (file: RestoreSnapshotFile, onFileProgress: FileProgressCallback) => Promise<FileOutcome>

interface FileProgressArgs {
  onProgress?: RestoreProgressCallback
  totals: ProgressTotals
  counts: RestoreCounters
  file: RestoreSnapshotFile
  startedAt: number
  transferred: number
  total: number
}

interface RestoreRunArgs {
  dest: Destination
  periodKey: string
  files: RestoreSnapshotFile[]
  missing: string[]
  context: RestoreContext
  signal: AbortSignal
  onProgress?: RestoreProgressCallback
}

interface FileSelection {
  selected: RestoreSnapshotFile[]
  missing: string[]
}

interface RestoreHandlerArgs {
  files: RestoreSnapshotFile[]
  missing: string[]
  context: RestoreContext
  signal: AbortSignal
  handler: FileRestoreHandler
  onProgress?: RestoreProgressCallback
}

interface ProcessFilesArgs {
  files: RestoreSnapshotFile[]
  context: RestoreContext
  signal: AbortSignal
  handler: FileRestoreHandler
  totals: ProgressTotals
  counts: RestoreCounters
  results: RestoreFileResult[]
  startedAt: number
  onProgress?: RestoreProgressCallback
}

type RestoreDriverArgs = Omit<RestoreRunArgs, "missing" | "signal" | "onProgress"> & {
  restoreWithHandler: (handler: FileRestoreHandler) => Promise<RestoreResult>
}

export type {
  RestoreContext,
  FileOutcome,
  TargetResolution,
  RestoreCounters,
  ProgressTotals,
  RestoreProgressCallback,
  FileProgressCallback,
  FileProgressReporter,
  FileRestoreHandler,
  FileProgressArgs,
  RestoreRunArgs,
  ProcessFilesArgs,
  FileSelection,
  RestoreHandlerArgs,
  RestoreDriverArgs,
}
