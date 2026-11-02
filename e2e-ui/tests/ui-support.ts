import { execSync } from "node:child_process"
import { expect, type BrowserContext, type Page } from "@playwright/test"

const S3_LIST_SCRIPT = `
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
const client = new S3Client({
  region: "garage",
  credentials: { accessKeyId: "GKe2eAccess", secretAccessKey: "chest-e2e-secret-key-0123456789abcdef" },
  endpoint: "http://garage:3900",
  forcePathStyle: true,
});
const result = await client.send(new ListObjectsV2Command({ Bucket: "backups", Prefix: "backups/", MaxKeys: 1000 }));
console.log(String((result.Contents ?? []).length));
`

const dockerExec = (container: string, cmd: string): string =>
  execSync(`docker exec ${container} ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()

const s3ListCount = async (): Promise<number> => {
  try {
    const encoded = Buffer.from(S3_LIST_SCRIPT, "utf8").toString("base64")
    const out = execSync(`docker exec chest-e2eui-app sh -c 'bun -e "$(printf %s ${encoded} | base64 -d)"'`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
    return Number(out) || 0
  } catch (err) {
    console.warn("s3 list count failed", err)
    return 0
  }
}

const selectType = async (page: Page, value: string): Promise<void> => {
  const firstSelect = page.locator("select").first()
  await firstSelect.selectOption(value)
}

const groupInput = (page: Page, label: string): ReturnType<Page["locator"]> =>
  page.locator(`css=div >> text="${label}"`).locator("..").locator("input")

const addSource = async (page: Page, fill: (page: Page) => Promise<void>): Promise<void> => {
  await page.goto("/sources/new")
  await fill(page)
  await page.getByRole("button", { name: "Create" }).click()
  await page.waitForSelector("text=Manage backup sources", { timeout: 60_000 })
}

const addDestination = async (page: Page, fill: (page: Page) => Promise<void>): Promise<void> => {
  await page.goto("/destinations/new")
  await fill(page)
  await page.getByRole("button", { name: "Create" }).click()
  await page.waitForSelector("text=Manage backup destinations", { timeout: 60_000 })
}

const waitForFiles = async (container: string, path: string): Promise<number> => {
  for (let i = 0; i < 30; i++) {
    const count = Number(dockerExec(container, `find ${path} -type f | wc -l`))
    if (count >= 2) return count
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return Number(dockerExec(container, `find ${path} -type f | wc -l`))
}

const destIdByName = async (page: Page, name: string): Promise<string> => {
  const options = page.locator("#restore-dest option")
  for (let i = 0; i < (await options.count()); i++) {
    if ((await options.nth(i).textContent())?.includes(name)) return (await options.nth(i).getAttribute("value")) ?? ""
  }
  throw new Error(`destination "${name}" not found in restore dropdown`)
}

const waitForRestoredFile = async (container: string, path: string): Promise<number> => {
  for (let i = 0; i < 30; i++) {
    const count = Number(dockerExec(container, `find ${path} -type f | wc -l`))
    if (count > 0) return count
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return 0
}

const restoreFromDestination = async (context: BrowserContext, destName: string, targetPath: string): Promise<void> => {
  const page = await context.newPage()
  try {
    await page.goto("/restore")
    const destId = await destIdByName(page, destName)
    await page.locator("#restore-dest").selectOption(destId)
    await expect(page.locator('#restore-snapshot option:not([value=""])')).toHaveCount(1, { timeout: 60_000 })
    const snapshotValue = (await page.locator('#restore-snapshot option:not([value=""])').getAttribute("value")) ?? ""
    await page.locator("#restore-snapshot").selectOption(snapshotValue)

    await page.getByPlaceholder("Search files…").fill("hostname")
    await expect(page.locator("[data-file-checkbox]")).toHaveCount(1, { timeout: 60_000 })
    await page.locator("[data-file-checkbox]").first().check()

    await page.locator("#restore-target").fill(targetPath)
    await page.getByRole("button", { name: /^Restore/ }).first().click()
    await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click()
  } finally {
    await page.close()
  }
}

export { dockerExec, s3ListCount, selectType, groupInput, addSource, addDestination, waitForFiles, destIdByName, waitForRestoredFile, restoreFromDestination }
