import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "react-i18next"
import { useDestinationForm } from "@/hooks/use-destination-form"
import * as styles from "./sftp-fields.styles"

const SftpFields = () => {
  const { t } = useTranslation()
  const { form, update } = useDestinationForm()

  return (
    <>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.sftpHost")}</Label>
        <Input
          value={form.host as string}
          onChange={(e) => {
            update("host", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.sftpPort")}</Label>
        <Input
          type="number"
          value={form.port as number}
          onChange={(e) => {
            update("port", Number(e.target.value))
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.sftpUser")}</Label>
        <Input
          value={form.user as string}
          onChange={(e) => {
            update("user", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.sftpPassword")}</Label>
        <Input
          type="password"
          value={form.password as string}
          onChange={(e) => {
            update("password", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.privateKey")}</Label>
        <Input
          value={form.privateKey as string}
          onChange={(e) => {
            update("privateKey", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.timeout")}</Label>
        <Input
          type="number"
          value={(form.timeout as number | undefined) ?? ""}
          onChange={(e) => {
            update("timeout", e.target.value ? Number(e.target.value) : undefined)
          }}
        />
      </div>
    </>
  )
}

export { SftpFields }
