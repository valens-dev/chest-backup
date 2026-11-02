import { RetentionMode } from "@core/types/config"
import type { DiskSpace } from "@core/types/destination"

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

interface DestinationUsage {
  type: string
  name?: string
  path: string
  totalSize: number
  fileCount: number
  avgDurationMs: number
  available: boolean
  diskSpace?: DiskSpace
}

interface LocalUsage {
  totalSize: number
  fileCount: number
}

interface BackupStats {
  total: number
  success: number
  failed: number
  partial: number
  skipped: number
  avgDuration: number
  totalUploadedBytes: number
  filesChanged: number
}

type Result<T> = { ok: true; data: T } | { ok: false; error: Response }

interface CpuTimes {
  total: number
  idle: number
}

interface Retention {
  globalRetention: number
  retentionMode: RetentionMode
}

interface ExcludeSettings {
  patterns: string[]
}

interface SourceExclusion {
  path: string
  total: number
  excluded: number
}

interface SourceExclusions {
  patterns: string[]
  sources: SourceExclusion[]
}

interface LogStats {
  total: number
  debug: number
  info: number
  warn: number
  error: number
  fatal: number
}

interface DestinationRef {
  id?: string
  name?: string
  path: string
}

export type {
  PaginatedResult,
  BackupStats,
  DestinationUsage,
  LocalUsage,
  Result,
  CpuTimes,
  Retention,
  ExcludeSettings,
  SourceExclusion,
  SourceExclusions,
  LogStats,
  DestinationRef,
}
