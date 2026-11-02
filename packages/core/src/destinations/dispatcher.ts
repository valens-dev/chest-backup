import type { Config, Destination } from "../types/config"
import type { StoreResult } from "@chest-backup/shared"
import type { BackupProgressCallback } from "../types/destination"
import type { FileStat } from "../types/manifest"
import { storeLocalIncremental } from "./local"
import { enforceRetention } from "../backup/retention"
import { getDriver } from "./drivers"
import { logger } from "../utils/logger"
import { DestinationType } from "@chest-backup/shared"

const handleDestination = async (files: FileStat[], toDelete: string[], dest: Destination, periodKey: string): Promise<StoreResult> => {
  try {
    if (dest.type === DestinationType.Local) return await storeLocalIncremental(files, toDelete, dest, periodKey)
    return await getDriver(dest.type).store(files, toDelete, dest, periodKey)
  } catch (err) {
    logger.error({ dest: dest.path, err }, "destination store failed")
    return { success: false, error: String(err) }
  }
}

const buildSkippedResult = (dest: Destination): StoreResult => ({
  success: true,
  skipped: true,
  skippedReason: "no-changes",
  destId: dest.id,
  destName: dest.name,
  destPath: dest.path,
  destType: dest.type,
  destLabel: dest.name ?? dest.path,
  uploaded: [],
  deleted: [],
})

const applyRetention = async (dest: Destination, config: Config, periodKey: string, errors: string[]): Promise<void> => {
  try {
    if (dest.type === DestinationType.Local) {
      enforceRetention(dest, config.retention, config.retentionMode, periodKey)
      return
    }
    await getDriver(dest.type).enforceRetention(dest, config.retention, config.retentionMode, periodKey)
  } catch (err) {
    errors.push(`Retention enforcement failed for ${dest.path}: ${String(err)}`)
  }
}

const announceSkipped = (dest: Destination, onProgress?: BackupProgressCallback): void => {
  onProgress?.({ phase: "destination-done", destId: dest.id, destName: dest.name, destPath: dest.path, destType: dest.type, message: "skipped" })
}

const announceFailure = (dest: Destination, result: StoreResult, onProgress?: BackupProgressCallback): void => {
  onProgress?.({ phase: "destination-error", destId: dest.id, destName: dest.name, destPath: dest.path, destType: dest.type, message: result.error })
}

const announceDone = (dest: Destination, result: StoreResult, onProgress?: BackupProgressCallback): void => {
  onProgress?.({ phase: "destination-done", destId: dest.id, destName: dest.name, destPath: dest.path, destType: dest.type, speed: result.speed })
}

const tagResult = (result: StoreResult, dest: Destination): void => {
  if (dest.id) result.destId = dest.id
  result.destName = dest.name
  result.destPath = dest.path
  result.destType = dest.type
  result.destLabel = dest.name ?? dest.path
}

const storeToDestination = async (files: FileStat[], toDelete: string[], unchanged: number, dest: Destination, config: Config, errors: string[], periodKey: string, onProgress?: BackupProgressCallback): Promise<StoreResult> => {
  if (!files.length && !toDelete.length) {
    logger.info({ dest: dest.name ?? dest.path, unchanged }, "destination already up to date, skipping")
    announceSkipped(dest, onProgress)
    return buildSkippedResult(dest)
  }

  onProgress?.({ phase: "destination-start", destId: dest.id, destName: dest.name, destPath: dest.path, destType: dest.type })

  const start = Date.now()
  const result = await handleDestination(files, toDelete, dest, periodKey)
  result.durationMs = Date.now() - start
  tagResult(result, dest)

  if (!result.success) {
    announceFailure(dest, result, onProgress)
    return result
  }

  announceDone(dest, result, onProgress)
  await applyRetention(dest, config, periodKey, errors)
  return result
}

export { handleDestination, storeToDestination }
