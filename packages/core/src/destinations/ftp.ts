import { createReadStream, createWriteStream } from "node:fs"
import { Client, FileType } from "basic-ftp"
import type { Destination } from "../types/config"
import { RetentionMode } from "../types/config"
import type { FileStat } from "../types/manifest"
import type { RemoteUsage } from "../types/destination"
import type { StoreResult, RestoreResult, RestoreSnapshot, RestoreSnapshotFile } from "@chest-backup/shared"
import type { RestoreDriverArgs, RestoreContext, FileOutcome, FileProgressCallback } from "../types/restore"
import { logger } from "../utils/logger"
import { speedFrom } from "../utils/upload"
import { normalizeBase, mirrorPathFor } from "../utils/mirror"
import { isPeriodKey } from "../backup/periods"
import { uploadFiles, deleteFiles, walkUsage } from "./engine"
import { enforceRemoteRetention, walkRemoteFiles, type RemoteFs } from "./remote-fs"
import { resolveTarget, skippedOutcome, restoredOutcome, dryRunOutcome } from "../restore/transfer"

const makeDestLabel = (dest: Destination): string => `ftp://${dest.user ?? "unknown"}@${dest.host ?? "unknown"}:${String(dest.port ?? 21)}${dest.path}`

const ftpFs = (ftp: Client): RemoteFs => ({
  list: (dir) => ftp.list(dir).then((entries) => entries.map((entry) => ({ name: entry.name, type: entry.type === FileType.Directory ? "dir" : "file", size: entry.size }))),
  removeFile: (path) => ftp.remove(path, true),
  removeDir: (dir) => ftp.removeEmptyDir(dir),
})

const connectClient = async (dest: Destination): Promise<Client> => {
  const ftp = new Client(dest.timeout ?? 8_000)
  try {
    await ftp.access({ host: dest.host, port: dest.port ?? 21, user: dest.user, password: dest.password, secure: false })
  } catch (err) {
    const msg = err instanceof Error ? err.message || "no details (check host/port/credentials/firewall)" : String(err)
    throw new Error(`FTP connection to ${makeDestLabel(dest)} failed: ${msg}`, { cause: err })
  }
  return ftp
}

const closeFtpQuietly = (ftp: Client): void => {
  try {
    ftp.close()
  } catch (err) {
    logger.warn({ err }, "failed to close FTP connection")
  }
}

const ensureOneDir = async (ftp: Client, dir: string): Promise<void> => {
  try {
    await ftp.ensureDir(dir)
  } catch (err) {
    logger.debug({ dir, err }, "directory already exists")
  }
}

const ensureRemoteDir = async (ftp: Client, remoteDir: string): Promise<void> => {
  const parts = remoteDir.split("/").filter(Boolean)
  let current = ""
  for (const part of parts) {
    current = current ? `${current}/${part}` : `/${part}`
    await ensureOneDir(ftp, current)
  }
}

const storeFtpIncremental = async (files: FileStat[], toDelete: string[], dest: Destination, periodKey: string): Promise<StoreResult> => {
  if (!dest.host || !dest.user) return { success: false, error: "FTP destination missing host or user" }
  const ftp = await connectClient(dest)
  try {
    await ensureRemoteDir(ftp, dest.path)
    const base = mirrorPathFor(normalizeBase(dest.path), periodKey)
    await ensureRemoteDir(ftp, base)
    const upload = await uploadFiles({ files, base, destLabel: makeDestLabel(dest), ensureDir: (dir) => ensureRemoteDir(ftp, dir), uploadFile: (src, remote) => ftp.uploadFrom(createReadStream(src), remote) })
    const removal = await deleteFiles({ toDelete, base, deleteFile: (remote) => ftp.remove(remote) })
    const speed = speedFrom(upload.totalUploaded, upload.totalDuration)
    logger.info(
      { dest: makeDestLabel(dest), uploaded: upload.uploaded.length, deleted: removal.deleted.length, failed: upload.failed.length },
      "FTP incremental sync complete",
    )
    return {
      success: upload.failed.length === 0,
      uploaded: upload.uploaded,
      deleted: removal.deleted,
      failedCount: upload.failed.length,
      vanishedCount: upload.vanished.length,
      speed,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message || "no details" : String(err)
    logger.error({ dest: makeDestLabel(dest), error: msg }, "FTP incremental upload failed")
    return { success: false, error: msg }
  } finally {
    closeFtpQuietly(ftp)
  }
}

const scanFtpUsage = async (dest: Destination): Promise<RemoteUsage | null> => {
  const ftp = await connectClient(dest).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ host: dest.host, path: dest.path, error: msg }, "failed to connect to FTP destination for usage scan")
    return undefined
  })
  if (!ftp) return null
  try {
    const base = normalizeBase(dest.path)
    try {
      await ftp.cd(base)
    } catch (err) {
      logger.debug({ base, err }, "FTP base directory not found during usage scan")
      return { totalSize: 0, fileCount: 0 }
    }
    return await walkUsage(ftpFs(ftp).list, base)
  } finally {
    closeFtpQuietly(ftp)
  }
}

const enforceRetentionFtp = async (dest: Destination, globalRetention: number, mode: RetentionMode, periodKey: string): Promise<void> => {
  if (!dest.host || !dest.user) return
  const ftp = await connectClient(dest)
  try {
    await enforceRemoteRetention(ftpFs(ftp), normalizeBase(dest.path), globalRetention, mode, periodKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ path: dest.path, error: msg }, "FTP retention failed")
  } finally {
    closeFtpQuietly(ftp)
  }
}

const listFtpSnapshots = async (dest: Destination, mode: RetentionMode): Promise<RestoreSnapshot[]> => {
  const ftp = await connectClient(dest)
  try {
    const base = normalizeBase(dest.path)
    try {
      await ftp.cd(base)
    } catch (err) {
      logger.debug({ base, err }, "FTP base directory not found during snapshot scan")
      return []
    }
    const entries = await ftp.list(base)
    return entries
      .filter((entry) => entry.type === FileType.Directory && isPeriodKey(mode, entry.name))
      .map((entry) => ({ key: entry.name, fileCount: null, totalSize: null }))
      .sort((a, b) => b.key.localeCompare(a.key))
  } finally {
    closeFtpQuietly(ftp)
  }
}

const listFtpFiles = async (dest: Destination, periodKey: string): Promise<RestoreSnapshotFile[]> => {
  const ftp = await connectClient(dest)
  try {
    const base = normalizeBase(dest.path)
    const root = `${base}/${periodKey}`
    const files: RestoreSnapshotFile[] = []
    await walkRemoteFiles(ftpFs(ftp), root, root, files)
    return files.sort((a, b) => a.path.localeCompare(b.path))
  } finally {
    closeFtpQuietly(ftp)
  }
}

const fetchFtpFile = async (ftp: Client, sourceRoot: string, file: RestoreSnapshotFile, context: RestoreContext, onFileProgress: FileProgressCallback): Promise<FileOutcome> => {
  const { target, skipped } = await resolveTarget(file, context)
  if (skipped) return skippedOutcome(file.path, target, file.size)
  await ftp.downloadTo(createWriteStream(target), `${sourceRoot}/${file.path}`)
  onFileProgress(file.size, file.size)
  return restoredOutcome(file.path, target, file.size)
}

const restoreFtp = async (args: RestoreDriverArgs): Promise<RestoreResult> => {
  const ftp = await connectClient(args.dest)
  try {
    const sourceRoot = `${normalizeBase(args.dest.path)}/${args.periodKey}`
    return await args.restoreWithHandler((file, onFileProgress) =>
      args.context.dryRun ? dryRunOutcome(file, args.context) : fetchFtpFile(ftp, sourceRoot, file, args.context, onFileProgress),
    )
  } finally {
    closeFtpQuietly(ftp)
  }
}

export { storeFtpIncremental, scanFtpUsage, enforceRetentionFtp, makeDestLabel, listFtpSnapshots, listFtpFiles, restoreFtp }
