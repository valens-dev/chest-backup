import type { RestoreSnapshotFile } from "@chest-backup/shared"
import { RetentionMode } from "../types/config"
import { isPeriodKey, selectExpiredPeriodKeys } from "../backup/periods"
import { logger } from "../utils/logger"

type RemoteEntryType = "file" | "dir"

interface RemoteEntry {
  name: string
  type: RemoteEntryType
  size: number
}

interface RemoteFs {
  list: (dir: string) => Promise<RemoteEntry[]>
  removeFile: (path: string) => Promise<unknown>
  removeDir: (dir: string) => Promise<unknown>
}

const removeRemoteEntry = async (fs: RemoteFs, dir: string, entry: RemoteEntry): Promise<void> => {
  const child = `${dir}/${entry.name}`
  if (entry.type === "dir") await removeRemoteTree(fs, child)
  else await fs.removeFile(child).catch((err: unknown) => {
    logger.debug({ file: child, err }, "failed to delete remote file during retention")
  })
}

const removeRemoteTree = async (fs: RemoteFs, dir: string): Promise<void> => {
  const entries = await fs.list(dir)
  for (const entry of entries) await removeRemoteEntry(fs, dir, entry)
  try {
    await fs.removeDir(dir)
  } catch (err) {
    logger.debug({ dir, err }, "failed to remove remote directory")
  }
}

const listRemotePeriodFolders = async (fs: RemoteFs, base: string, mode: RetentionMode): Promise<string[]> => {
  try {
    const entries = await fs.list(base)
    return entries.filter((entry) => entry.type === "dir" && isPeriodKey(mode, entry.name)).map((entry) => entry.name)
  } catch (err) {
    logger.debug({ base, err }, "remote retention scan unreadable")
    return []
  }
}

const removeRemotePeriodFolder = async (fs: RemoteFs, base: string, periodKey: string): Promise<void> => {
  const dir = `${base}/${periodKey}`
  try {
    await removeRemoteTree(fs, dir)
    logger.info({ dir }, "deleted expired snapshot folder for retention")
  } catch (err) {
    logger.error({ dir, err }, "failed to delete expired snapshot folder")
  }
}

const enforceRemoteRetention = async (fs: RemoteFs, base: string, globalRetention: number, mode: RetentionMode, periodKey: string): Promise<void> => {
  if (mode === RetentionMode.Forever) {
    logger.debug({ base, periodKey }, "retention disabled, keeping all snapshot folders")
    return
  }
  const retention = Math.max(globalRetention, 1)
  const expired = selectExpiredPeriodKeys(await listRemotePeriodFolders(fs, base, mode), retention, periodKey, (name) => isPeriodKey(mode, name))
  for (const key of expired) await removeRemotePeriodFolder(fs, base, key)
}

const collectRemoteEntry = async (fs: RemoteFs, dir: string, root: string, entry: RemoteEntry, acc: RestoreSnapshotFile[]): Promise<void> => {
  const child = `${dir}/${entry.name}`
  if (entry.type === "dir") await walkRemoteFiles(fs, child, root, acc)
  else acc.push({ path: child.slice(root.length + 1), size: entry.size })
}

const walkRemoteFiles = async (fs: RemoteFs, dir: string, root: string, acc: RestoreSnapshotFile[]): Promise<void> => {
  let entries: RemoteEntry[]
  try {
    entries = await fs.list(dir)
  } catch (err) {
    logger.debug({ dir, err }, "remote directory listing failed during snapshot file scan")
    return
  }
  for (const entry of entries) await collectRemoteEntry(fs, dir, root, entry, acc)
}

export { enforceRemoteRetention, walkRemoteFiles, type RemoteEntry, type RemoteFs }
