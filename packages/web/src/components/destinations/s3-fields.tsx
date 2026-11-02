import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslation } from "react-i18next"
import { useDestinationForm } from "@/hooks/use-destination-form"
import * as styles from "./sftp-fields.styles"

const S3Fields = () => {
  const { t } = useTranslation()
  const { form, update } = useDestinationForm()

  return (
    <>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.s3Host")}</Label>
        <Input
          value={form.host as string}
          onChange={(e) => {
            update("host", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.s3Port")}</Label>
        <Input
          type="number"
          value={form.port as number}
          onChange={(e) => {
            update("port", Number(e.target.value))
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.s3Region")}</Label>
        <Input
          value={form.region as string}
          onChange={(e) => {
            update("region", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.s3AccessKeyId")}</Label>
        <Input
          value={form.accessKeyId as string}
          onChange={(e) => {
            update("accessKeyId", e.target.value)
          }}
        />
      </div>
      <div className={styles.fieldGroup}>
        <Label>{t("destinations.s3SecretAccessKey")}</Label>
        <Input
          type="password"
          value={form.secretAccessKey as string}
          onChange={(e) => {
            update("secretAccessKey", e.target.value)
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

export { S3Fields }
