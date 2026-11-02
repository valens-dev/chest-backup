import { expect, test } from "@playwright/test"
import {
  addDestination,
  addSource,
  dockerExec,
  groupInput,
  restoreFromDestination,
  s3ListCount,
  selectType,
  waitForFiles,
  waitForRestoredFile,
} from "./ui-support"

test.describe("full UI round-trip: sources + destinations -> backup -> restore", () => {
  test("add every source type via the UI", async ({ page }) => {
    await addSource(page, async (p) => {
      await p.locator("#path").fill("/etc/hostname")
    })

    await addSource(page, async (p) => {
      await selectType(p, "postgres")
      await p.locator("#host").fill("postgres")
      await p.locator("#port").fill("5432")
      await p.locator("#user").fill("chest")
      await p.locator("#password").fill("chest")
      await expect(p.locator('#database option[value="chestdb"]')).toHaveCount(1, { timeout: 60_000 })
      await p.locator("#database").selectOption("chestdb")
    })

    await addSource(page, async (p) => {
      await selectType(p, "sqlite-container")
      await expect(p.locator('#containerName option[value="chest-e2eui-sqldb"]')).toHaveCount(1, { timeout: 60_000 })
      await p.locator("#containerName").selectOption("chest-e2eui-sqldb")
      await p.locator("#dbPath").fill("/data/app.db")
    })

    await addSource(page, async (p) => {
      await selectType(p, "container-volume")
      await expect(p.locator('#cvContainerName option[value="chest-e2eui-appvol"]')).toHaveCount(1, { timeout: 60_000 })
      await p.locator("#cvContainerName").selectOption("chest-e2eui-appvol")
      await expect(p.locator("#volumePath option").nth(1)).toHaveCount(1, { timeout: 60_000 })
      await p.locator("#volumePath").selectOption({ index: 1 })
    })

    await page.goto("/sources")
    for (const name of ["File Path", "PostgreSQL", "SQLite Container", "Container Volume"]) {
      await expect(page.getByText(name).first()).toBeVisible()
    }
  })

  test("add local, sftp, s3 and ftp destinations via the UI", async ({ page }) => {
    await addDestination(page, async (p) => {
      await p.locator("#name").fill("Local")
      await p.locator("#path").fill("/backups/local")
    })

    await addDestination(page, async (p) => {
      await selectType(p, "sftp")
      await p.locator("#name").fill("SFTP")
      await p.locator("#path").fill("/backups/sftp")
      await groupInput(p, "SFTP Host").fill("sftp")
      await groupInput(p, "SFTP Port").fill("22")
      await groupInput(p, "SFTP User").fill("chest")
      await groupInput(p, "SFTP Password").fill("chest")
    })

    await addDestination(page, async (p) => {
      await selectType(p, "s3")
      await p.locator("#name").fill("S3")
      await p.locator("#path").fill("/backups")
      await groupInput(p, "S3 Endpoint Host").fill("garage")
      await groupInput(p, "S3 Port").fill("3900")
      await groupInput(p, "Region").fill("garage")
      await groupInput(p, "Access Key ID").fill("GKe2eAccess")
      await groupInput(p, "Secret Access Key").fill("chest-e2e-secret-key-0123456789abcdef")
    })

    await addDestination(page, async (p) => {
      await selectType(p, "ftp")
      await p.locator("#name").fill("FTP")
      await p.locator("#path").fill("/backups/ftp")
      await groupInput(p, "FTP Host").fill("ftp")
      await groupInput(p, "FTP Port").fill("21")
      await groupInput(p, "FTP User").fill("chest")
      await groupInput(p, "FTP Password").fill("chest")
    })

    await page.goto("/destinations")
    for (const name of ["Local", "SFTP", "S3", "FTP"]) {
      await expect(page.getByText(name).first()).toBeVisible()
    }
  })

  test("trigger a backup from the UI and wait for it to complete", async ({ page }) => {
    await page.goto("/activity")
    await page.locator("main").getByRole("button", { name: "Run Backup Now" }).click()
    await expect(page.getByText("Backup Complete")).toBeVisible({ timeout: 180_000 })
  })

  test("backup landed real data on all destinations", async () => {
    const localFiles = await waitForFiles("chest-e2eui-app", "/backups/local")
    expect(localFiles).toBeGreaterThanOrEqual(2)

    const sftpCount = await waitForFiles("chest-e2eui-sftp", "/backups/sftp")
    expect(sftpCount).toBeGreaterThanOrEqual(2)

    const ftpCount = await waitForFiles("chest-e2eui-ftp", "/backups/ftp")
    expect(ftpCount).toBeGreaterThanOrEqual(2)

    const sqliteDump = dockerExec("chest-e2eui-app", "find /backups/local -name '*sqldb*.db' | head -1")
    expect(sqliteDump).not.toBe("")
  })

  test("backup landed real data in the S3 bucket", async () => {
    for (let i = 0; i < 30; i++) {
      const count = await s3ListCount()
      if (count >= 2) return
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    expect(await s3ListCount()).toBeGreaterThanOrEqual(2)
  })

  test("restore from SFTP lands data on disk", async ({ browser }) => {
    const context = await browser.newContext()
    try {
      await restoreFromDestination(context, "SFTP", "/restored-sftp")
    } finally {
      await context.close()
    }
    const restored = await waitForRestoredFile("chest-e2eui-app", "/restored-sftp")
    expect(restored).toBeGreaterThan(0)
  })

  test("restore from S3 lands data on disk", async ({ browser }) => {
    const context = await browser.newContext()
    try {
      await restoreFromDestination(context, "S3", "/restored-s3")
    } finally {
      await context.close()
    }
    const restored = await waitForRestoredFile("chest-e2eui-app", "/restored-s3")
    expect(restored).toBeGreaterThan(0)
  })

  test("restore from FTP lands data on disk", async ({ browser }) => {
    const context = await browser.newContext()
    try {
      await restoreFromDestination(context, "FTP", "/restored-ftp")
    } finally {
      await context.close()
    }
    const restored = await waitForRestoredFile("chest-e2eui-app", "/restored-ftp")
    expect(restored).toBeGreaterThan(0)
  })
})
