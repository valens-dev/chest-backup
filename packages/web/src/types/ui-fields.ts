import type { ContainerVolume } from "@chest-backup/shared"

interface PostgresFieldsProps {
  form: Record<string, unknown>
  update: (key: string, value: unknown) => void
  isContainer: boolean
}

interface SqliteFieldsProps {
  form: Record<string, unknown>
  update: (key: string, value: unknown) => void
  containers: string[]
  containersLoading: boolean
  containersError: string
}

interface ContainerVolumeFieldsProps {
  form: Record<string, unknown>
  update: (key: string, value: unknown) => void
  containers: string[]
  containersLoading: boolean
  containersError: string
  volumes: ContainerVolume[]
  volumesError: string
}

interface EditSourceFieldsProps {
  type: string
  form: Record<string, unknown>
  update: (key: string, value: unknown) => void
  containers: string[]
  containersLoading: boolean
  containersError: string
  volumes: ContainerVolume[]
  volumesError: string
}

interface ContainerSelectProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  containers: string[]
  loading: boolean
  error: string
  allowCustomValue?: boolean
}

interface PostgresDatabasesParams {
  type: string
  host: string
  port: number
  user: string
  password: string
  containerName: string
  isPostgres: boolean
  fieldsReady: boolean
}

export type {
  PostgresFieldsProps,
  SqliteFieldsProps,
  ContainerVolumeFieldsProps,
  EditSourceFieldsProps,
  ContainerSelectProps,
  PostgresDatabasesParams,
}
