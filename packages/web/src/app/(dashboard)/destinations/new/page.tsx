"use client"

import { useTranslation } from "react-i18next"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Header } from "@/components/layout/header"
import { DestinationTypeFields } from "@/components/destinations/type-fields"
import { useCreateDestination } from "@/hooks/queries/destinations"
import { DestinationFormProvider } from "@/hooks/use-destination-form"
import { DestinationType } from "@chest-backup/shared"
import { toDestinationTypeFromForm } from "@/lib/enums"
import type { SyntheticEvent } from "react"
import * as styles from "./page.styles"

const NewDestinationPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createMutation = useCreateDestination()
  const [form, setForm] = useState<Record<string, unknown>>({
    type: DestinationType.Local,
    name: "",
    path: "",
    port: 22,
    parallel: false,
    skip: false,
  })

  const updateField = (key: string, value: unknown): void => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const type = toDestinationTypeFromForm(form)

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = { type, name: form.name || undefined, path: form.path, parallel: form.parallel, skip: form.skip }

    if (type === DestinationType.Sftp) {
      body.host = form.host
      body.port = form.port
      body.user = form.user
      body.password = form.password
      body.privateKey = form.privateKey
    }

    if (type === DestinationType.S3) {
      body.host = form.host
      body.port = form.port
      body.region = form.region
      body.accessKeyId = form.accessKeyId
      body.secretAccessKey = form.secretAccessKey
    }

    if (type === DestinationType.Ftp) {
      body.host = form.host
      body.port = form.port
      body.user = form.user
      body.password = form.password
    }

    if (form.timeout !== undefined) body.timeout = form.timeout

    return body
  }

  const handleCreate = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()

    createMutation
      .mutateAsync(buildBody())
      .then(() => {
        void navigate("/destinations")
      })
      .catch(() => {
        alert(t("common.saveError"))
      })
  }

  return (
    <div className={styles.page}>
      <Header title={t("destinations.addDestination")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("destinations.newDestination")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className={styles.fieldGroup}>
            <div className={styles.fieldGroup}>
              <Label>{t("destinations.destinationType")}</Label>
              <Select
                value={type}
                onChange={(e) => { updateField("type", e.target.value); }}
              >
                <option value={DestinationType.Local}>{t("destinations.local")}</option>
                <option value={DestinationType.Sftp}>{t("destinations.sftp")}</option>
                <option value={DestinationType.S3}>{t("destinations.s3")}</option>
                <option value={DestinationType.Ftp}>{t("destinations.ftp")}</option>
              </Select>
            </div>

            <div className={styles.fieldGroup}>
              <Label htmlFor="name">{t("destinations.name")}</Label>
              <Input
                id="name"
                value={form.name as string}
                onChange={(e) => { updateField("name", e.target.value); }}
                placeholder={t("destinations.namePlaceholder")}
              />
            </div>

            <div className={styles.fieldGroup}>
              <Label htmlFor="path">{t("destinations.path")}</Label>
              <Input
                id="path"
                value={form.path as string}
                onChange={(e) => { updateField("path", e.target.value); }}
                placeholder={t("destinations.pathPlaceholder")}
              />
            </div>

            <DestinationFormProvider form={form} update={updateField}>
              <DestinationTypeFields />
            </DestinationFormProvider>

            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{t("destinations.parallel")}</span>
              <Switch
                checked={form.parallel as boolean}
                onCheckedChange={(v) => { updateField("parallel", v); }}
              />
            </div>

            <div className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{t("destinations.skip")}</span>
              <Switch
                checked={form.skip as boolean}
                onCheckedChange={(v) => { updateField("skip", v); }}
              />
            </div>

            <div className={styles.actions}>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("common.loading") : t("common.create")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate("/destinations")}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default NewDestinationPage
