enum UploadOutcomeKind {
  Uploaded = "uploaded",
  Vanished = "vanished",
  Failed = "failed",
}

type FileUploadResult = {
  path: string
  outcome: UploadOutcomeKind
}

type UploadOutcome = {
  uploaded: string[]
  failed: string[]
  vanished: string[]
  totalUploaded: number
  totalDuration: number
}

type DeleteOutcome = {
  deleted: string[]
  failed: number
}

type ProgressPhase =
  | "run-start"
  | "archiving"
  | "destination-start"
  | "destination-done"
  | "destination-error"

interface BackupProgressEvent {
  phase: ProgressPhase
  runId?: string
  timestamp?: string
  destId?: string
  destName?: string
  destPath?: string
  destType?: string
  speed?: number
  archiveSize?: number
  message?: string
}

type BackupProgressCallback = (event: BackupProgressEvent) => void

interface RemoteUsage {
  totalSize: number
  fileCount: number
}

interface DiskSpace {
  used: number
  total: number
}

export {
  UploadOutcomeKind,
  type FileUploadResult,
  type UploadOutcome,
  type DeleteOutcome,
  type BackupProgressEvent,
  type BackupProgressCallback,
  type RemoteUsage,
  type DiskSpace,
}
