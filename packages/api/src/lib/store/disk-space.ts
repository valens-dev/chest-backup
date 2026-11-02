import { mkdtempSync, writeFileSync, rmSync, readFileSync, statfsSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import type { Destination } from "@core/types/config"
import { DestinationType } from "@chest-backup/shared"
import type { DiskSpace } from "@core/types/destination"
import { getDriver } from "@core/destinations/drivers"
import { logger } from "@core/utils/logger"

const SSH_PROBE_TIMEOUT_MS = 5_000

const parseDfOutput = (output: string): DiskSpace | undefined => {
  const [usedKb, totalKb] = output.trim().split(/\s+/).map((value) => parseInt(value, 10))
  if (!Number.isFinite(usedKb) || !Number.isFinite(totalKb) || totalKb <= 0) return undefined
  return { used: usedKb * 1024, total: totalKb * 1024 }
}

const writeTempKey = (keyMaterial: string): string | undefined => {
  try {
    const dir = mkdtempSync(join(tmpdir(), "chest-ssh-"))
    const keyPath = join(dir, "id")
    writeFileSync(keyPath, keyMaterial, { mode: 0o600 })
    return keyPath
  } catch (err) {
    logger.warn({ err }, "failed to write temporary ssh key")
    return undefined
  }
}

const cleanupTempKey = (keyPath: string | undefined): void => {
  if (!keyPath) return
  try {
    rmSync(keyPath, { recursive: true, force: true })
  } catch (err) {
    logger.warn({ err }, "failed to remove temporary ssh key")
  }
}

const resolveSshKey = (dest: Destination): string | undefined => {
  const key = dest.privateKey
  if (!key) return undefined
  const isPath = key.startsWith("/") || key.startsWith("~")

  try {
    const material = isPath ? readFileSync(key.replace(/^~/, homedir()), "utf8") : key
    return writeTempKey(material)
  } catch (err) {
    logger.warn({ err }, "failed to resolve ssh key")
    return undefined
  }
}

const runRemoteDf = async (dest: Destination): Promise<DiskSpace | undefined> => {
  const host = dest.host
  const user = dest.user
  if (!host || !user) return undefined

  const sshArgs = [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `ConnectTimeout=${String(Math.ceil((dest.timeout ?? 8_000) / 1000))}`,
    `-p ${String(dest.port ?? 22)}`,
  ]

  const keyPath = resolveSshKey(dest)
  if (keyPath) sshArgs.push("-i", keyPath)

  try {
    const output = await new Promise<string>((resolvePromise, rejectPromise) => {
      execFile(
        "ssh",
        [...sshArgs, `${user}@${host}`, `df -k --output=used,size "${dest.path}" 2>/dev/null | tail -1`],
        { timeout: (dest.timeout ?? 8_000) + SSH_PROBE_TIMEOUT_MS, encoding: "utf-8" },
        (err, stdout) => {
          if (err) {
            rejectPromise(new Error(`ssh disk space probe failed: ${err.message}`))
            return
          }
          resolvePromise(stdout)
        },
      )
    })
    return parseDfOutput(output)
  } catch (err) {
    logger.warn({ host, path: dest.path, err }, "sftp disk space probe failed")
    return undefined
  } finally {
    cleanupTempKey(keyPath)
  }
}

const getLocalDiskSpace = (dir: string): DiskSpace | undefined => {
  try {
    const stats = statfsSync(dir)
    const total = stats.blocks * stats.bsize
    const free = stats.bavail * stats.bsize
    if (total <= 0) return undefined
    return { used: total - free, total }
  } catch (err) {
    logger.debug({ dir, err }, "local disk space probe failed")
    return undefined
  }
}

const getRemoteDiskSpace = async (dest: Destination): Promise<DiskSpace | undefined> => {
  if (dest.type === DestinationType.Sftp) return runRemoteDf(dest)
  const driverGet = getDriver(dest.type).getDiskSpace
  return driverGet ? driverGet(dest) : undefined
}

export { getLocalDiskSpace, getRemoteDiskSpace }
