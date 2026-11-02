import type { DestinationType } from "./enums"

interface Source {
  id: string
  type: "path" | "postgres" | "postgres-container" | "container-volume" | "sqlite" | "sqlite-container"
  path?: string
  isFile?: boolean
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  containerName?: string
  name?: string
  containers?: string[]
  volumePath?: string
  include?: string[]
  dbPath?: string
  createdAt: string
  updatedAt: string
}

interface Destination {
  id: string
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
  createdAt: string
  updatedAt: string
}

interface Schedule {
  schedule: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
}

interface NotificationConfig {
  discord?: {
    webhookUrl: string
    enabled: boolean
  }
}

interface ContainerVolume {
  type: string
  source: string
  destination: string
  name?: string
  rw: boolean
}

interface SourceExclusion {
  path: string
  total: number
  excluded: number
}

interface SourceExclusions {
  patterns: string[]
  sources: SourceExclusion[]
}

export type { Source, Destination, Schedule, NotificationConfig, ContainerVolume, SourceExclusion, SourceExclusions }
