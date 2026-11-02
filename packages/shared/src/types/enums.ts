enum SourceErrorCode {
  Duplicate = "duplicate_source",
  NotFound = "source_not_found",
}

enum DestinationType {
  Local = "local",
  Sftp = "sftp",
  S3 = "s3",
  Ftp = "ftp",
}

enum RunStatus {
  Success = "success",
  Partial = "partial",
  Failed = "failed",
  Skipped = "skipped",
  Running = "running",
}

enum RunTrigger {
  Manual = "manual",
  Scheduled = "scheduled",
}

enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
  Fatal = "fatal",
}

enum RestoreStatus {
  Running = "running",
  Success = "success",
  Partial = "partial",
  Failed = "failed",
  Cancelled = "cancelled",
}

enum RestorePhase {
  Queued = "queued",
  Restoring = "restoring",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

enum RestoreFileStatus {
  Restored = "restored",
  Skipped = "skipped",
  Failed = "failed",
}

enum RunSort {
  Newest = "newest",
  Oldest = "oldest",
  Duration = "duration",
  Size = "size",
}

export {
  SourceErrorCode,
  DestinationType,
  RunStatus,
  RunTrigger,
  LogLevel,
  RestoreStatus,
  RestorePhase,
  RestoreFileStatus,
  RunSort,
}
