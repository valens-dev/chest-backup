import type { DestinationType } from "@chest-backup/shared"

enum RetentionMode {
  Monthly = "months",
  Weekly = "weeks",
  Forever = "forever",
}

type PathSource = {
  type: "path"
  path: string
  isFile?: boolean
}

type ParsedConnString = {
  host: string
  port: number
  user: string
  password: string
}

type PostgresSource = {
  type: "postgres"
  host: string
  port: number
  user: string
  password: string
  database: string
}

type PostgresContainerSource = {
  type: "postgres-container"
  containerName: string
  user: string
  password: string
  database: string
}

type ContainerVolumeSource = {
  type: "container-volume"
  containerName: string
  volumePath: string
  include?: string[]
}

type SqliteSource = {
  type: "sqlite"
  path: string
}

type SqliteContainerSource = {
  type: "sqlite-container"
  containerName: string
  dbPath: string
}

type Source =
  PathSource | PostgresSource | PostgresContainerSource | ContainerVolumeSource | SqliteSource | SqliteContainerSource

interface Destination {
  id?: string
  type: DestinationType
  name?: string
  path: string
  host?: string
  port?: number
  user?: string
  password?: string
  privateKey?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  parallel?: boolean
  timeout?: number
  skip?: boolean
}

interface DiscordConfig {
  webhookUrl: string
}

interface NotificationsConfig {
  discord?: DiscordConfig
}

interface ConfigFile {
  schedule?: string
  retention: number
  retentionMode: RetentionMode
  tempDir?: string
  paths?: string[]
  sqlite?: string[]
  exclude?: string[]
  sources: Source[]
  destinations: Destination[]
  notifications?: NotificationsConfig
}

type Config = Omit<ConfigFile, "paths" | "sqlite" | "exclude"> & {
  paths: string[]
  sqlite: string[]
  exclude: string[]
}

export {
  RetentionMode,
  type Config,
  type ConfigFile,
  type Source,
  type PathSource,
  type PostgresSource,
  type PostgresContainerSource,
  type ContainerVolumeSource,
  type SqliteSource,
  type SqliteContainerSource,
  type Destination,
  type ParsedConnString,
  type DiscordConfig,
  type NotificationsConfig,
}
