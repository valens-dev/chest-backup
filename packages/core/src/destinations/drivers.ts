import { DestinationType, type RestoreSnapshot, type RestoreSnapshotFile, type RestoreResult } from "@chest-backup/shared"
import type { FileStat } from "../types/manifest"
import type { Destination, RetentionMode } from "../types/config"
import type { RemoteUsage, DiskSpace } from "../types/destination"
import type { StoreResult } from "@chest-backup/shared"
import type { RestoreDriverArgs } from "../types/restore"
import { storeSftpIncremental, scanSftpUsage, enforceRetentionSftp, listSftpSnapshots, listSftpFiles, restoreSftp } from "./sftp"
import { storeS3Incremental, scanS3Usage, enforceRetentionS3, listS3Snapshots, listS3Files, restoreS3 } from "./s3"
import { storeFtpIncremental, scanFtpUsage, enforceRetentionFtp, listFtpSnapshots, listFtpFiles, restoreFtp } from "./ftp"

interface DestinationDriver {
  store: (files: FileStat[], toDelete: string[], dest: Destination, periodKey: string) => Promise<StoreResult>
  scanUsage: (dest: Destination) => Promise<RemoteUsage | null>
  enforceRetention: (dest: Destination, globalRetention: number, mode: RetentionMode, periodKey: string) => Promise<void>
  listSnapshots: (dest: Destination, mode: RetentionMode) => Promise<RestoreSnapshot[]>
  listFiles: (dest: Destination, periodKey: string) => Promise<RestoreSnapshotFile[]>
  restore: (args: RestoreDriverArgs) => Promise<RestoreResult>
  getDiskSpace?: (dest: Destination) => Promise<DiskSpace | undefined>
}

const drivers: Partial<Record<DestinationType, DestinationDriver>> = {
  [DestinationType.Sftp]: { store: storeSftpIncremental, scanUsage: scanSftpUsage, enforceRetention: enforceRetentionSftp, listSnapshots: listSftpSnapshots, listFiles: listSftpFiles, restore: restoreSftp },
  [DestinationType.S3]: { store: storeS3Incremental, scanUsage: scanS3Usage, enforceRetention: enforceRetentionS3, listSnapshots: listS3Snapshots, listFiles: listS3Files, restore: restoreS3 },
  [DestinationType.Ftp]: { store: storeFtpIncremental, scanUsage: scanFtpUsage, enforceRetention: enforceRetentionFtp, listSnapshots: listFtpSnapshots, listFiles: listFtpFiles, restore: restoreFtp },
}

const getDriver = (type: DestinationType): DestinationDriver => {
  const driver = drivers[type]
  if (!driver) throw new Error(`No destination driver registered for type: ${type}`)
  return driver
}

export { getDriver }
