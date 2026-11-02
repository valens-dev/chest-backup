import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { DestinationType, type RestoreSnapshot, type RestoreSnapshotFile } from "@chest-backup/shared"
import type { Destination, RetentionMode } from "../types/config"
import { getDriver } from "../destinations/drivers"
import { isPeriodKey } from "../backup/periods"
import { normalizeBase } from "../utils/mirror"
import { logger } from "../utils/logger"

const SNAPSHOT_KEY_PATTERN = /^\d{4}-(W\d{2}|\d{2})$/
const SNAPSHOT_DIR_SEPARATOR = "/"

const assertSnapshotKey = (key: string): void => {
  if (!SNAPSHOT_KEY_PATTERN.test(key)) throw new Error(`Invalid snapshot key: ${key}`)
}

const joinRelative = (parent: string, name: string): string =>
  parent ? `${parent}${SNAPSHOT_DIR_SEPARATOR}${name}` : name

const walkLocal = (root: string, relative: string, acc: RestoreSnapshotFile[]): void => {
  const entries = readdirSync(join(root, relative), { withFileTypes: true })
  for (const entry of entries) {
    const child = joinRelative(relative, entry.name)
    if (entry.isDirectory()) {
      walkLocal(root, child, acc)
      continue
    }
    if (entry.isFile()) acc.push({ path: child, size: statSync(join(root, child)).size })
  }
}

const localSnapshotFiles = (root: string): RestoreSnapshotFile[] => {
  const files: RestoreSnapshotFile[] = []
  walkLocal(root, "", files)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

const listLocalSnapshots = (dest: Destination, mode: RetentionMode): RestoreSnapshot[] => {
  const base = normalizeBase(dest.path)
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isPeriodKey(mode, entry.name))
      .map((entry) => {
        const root = join(base, entry.name)
        const files = localSnapshotFiles(root)
        return {
          key: entry.name,
          fileCount: files.length,
          totalSize: files.reduce((acc, file) => acc + file.size, 0),
          createdAt: statSync(root).mtime.toISOString(),
        }
      })
      .sort((a, b) => b.key.localeCompare(a.key))
  } catch (err) {
    logger.debug({ path: base, err }, "local snapshot scan unreadable")
    return []
  }
}

const listSnapshots = async (dest: Destination, mode: RetentionMode): Promise<RestoreSnapshot[]> => {
  if (dest.type === DestinationType.Local) return listLocalSnapshots(dest, mode)
  return getDriver(dest.type).listSnapshots(dest, mode)
}

const countSnapshotFiles = async (dest: Destination, periodKey: string): Promise<{ fileCount: number; totalSize: number }> => {
  const files = await listSnapshotFiles(dest, periodKey)
  return { fileCount: files.length, totalSize: files.reduce((acc, file) => acc + file.size, 0) }
}

const listSnapshotFiles = async (dest: Destination, periodKey: string): Promise<RestoreSnapshotFile[]> => {
  assertSnapshotKey(periodKey)
  if (dest.type === DestinationType.Local) return localSnapshotFiles(join(normalizeBase(dest.path), periodKey))
  return getDriver(dest.type).listFiles(dest, periodKey)
}

export { listSnapshots, countSnapshotFiles, listSnapshotFiles, assertSnapshotKey }
