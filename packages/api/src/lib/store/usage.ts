import { existsSync } from "node:fs"
import { dirname } from "node:path"
import type { Destination } from "@core/types/config"
import { DestinationType } from "@chest-backup/shared"
import type { DestinationUsage } from "../../types/api"
import type { RemoteUsage } from "@core/types/destination"
import { getDriver } from "@core/destinations/drivers"
import { SFTP_SCAN_TIMEOUT_MS, withTimeout } from "@core/utils/timeout"
import { scanLocalUsage } from "../utils"
import { getLocalDiskSpace, getRemoteDiskSpace } from "./disk-space"
import { readBackupHistory } from "./backups"

const destAvgDurationMs = (dest: Destination): number => {
  const durations = readBackupHistory()
    .flatMap((record) => record.destinationResults)
    .filter((result) => result.success && !result.skipped && (result.destId === dest.id || result.destPath === dest.path))
    .map((result) => result.durationMs)
    .filter((duration): duration is number => typeof duration === "number" && duration > 0)

  return durations.length ? durations.reduce((acc, duration) => acc + duration, 0) / durations.length : 0
}

const buildLocalUsage = (dest: Destination, avgDurationMs: number): DestinationUsage | null => {
  try {
    if (!existsSync(dest.path)) return null
    const usage = scanLocalUsage(dest.path)
    return {
      type: dest.type,
      name: dest.name,
      path: dest.path,
      totalSize: usage.totalSize,
      fileCount: usage.fileCount,
      avgDurationMs,
      available: true,
      diskSpace: getLocalDiskSpace(dest.path),
    }
  } catch (err) {
    console.error("failed to scan local destination", dest.path, err)
    return null
  }
}

const scanRemoteUsage = (dest: Destination): Promise<RemoteUsage | null> => getDriver(dest.type).scanUsage(dest)

const buildRemoteUsage = async (dest: Destination, avgDurationMs: number): Promise<DestinationUsage | null> => {
  const [usage, diskSpace] = await Promise.all([
    withTimeout(scanRemoteUsage(dest), SFTP_SCAN_TIMEOUT_MS, null),
    getRemoteDiskSpace(dest),
  ])
  if (!usage) return null

  return {
    type: dest.type,
    name: dest.name,
    path: dest.path,
    totalSize: usage.totalSize,
    fileCount: usage.fileCount,
    avgDurationMs,
    available: true,
    diskSpace,
  }
}

const buildUnavailableUsage = async (dest: Destination, avgDurationMs: number): Promise<DestinationUsage> => ({
  type: dest.type,
  name: dest.name,
  path: dest.path,
  totalSize: 0,
  fileCount: 0,
  avgDurationMs,
  available: false,
  diskSpace: dest.type === DestinationType.Local ? getLocalDiskSpace(dirname(dest.path)) : await getRemoteDiskSpace(dest),
})

const buildDestUsage = async (dest: Destination, avgDurationMs: number): Promise<DestinationUsage> => {
  const usage = dest.type === DestinationType.Local ? buildLocalUsage(dest, avgDurationMs) : await buildRemoteUsage(dest, avgDurationMs)
  return usage ?? buildUnavailableUsage(dest, avgDurationMs)
}

export { destAvgDurationMs, buildDestUsage }
