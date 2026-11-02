import { z } from "zod"
import { DestinationType } from "@chest-backup/shared"
import { RetentionMode } from "../types/config"

const PathSourceSchema = z.object({
  type: z.literal("path"),
  path: z.string().min(1),
  isFile: z.boolean().optional(),
})

const PostgresSourceSchema = z.object({
  type: z.literal("postgres"),
  host: z.string().min(1),
  port: z.number().int().positive(),
  user: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
})

const PostgresContainerSourceSchema = z.object({
  type: z.literal("postgres-container"),
  containerName: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
})

const ContainerVolumeSourceSchema = z.object({
  type: z.literal("container-volume"),
  containerName: z.string().min(1),
  volumePath: z.string().min(1),
  include: z.array(z.string().min(1)).optional(),
})

const SqliteSourceSchema = z.object({
  type: z.literal("sqlite"),
  path: z.string().min(1),
})

const SqliteContainerSourceSchema = z.object({
  type: z.literal("sqlite-container"),
  containerName: z.string().min(1),
  dbPath: z.string().min(1),
})

const SourceSchema = z.discriminatedUnion("type", [
  PathSourceSchema,
  PostgresSourceSchema,
  PostgresContainerSourceSchema,
  ContainerVolumeSourceSchema,
  SqliteSourceSchema,
  SqliteContainerSourceSchema,
])

const DestinationSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(DestinationType),
  path: z.string().min(1),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  region: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  retention: z.number().int().positive().optional(),
  parallel: z.boolean().optional().default(true),
  timeout: z.number().int().positive().optional(),
  skip: z.boolean().optional().default(false),
})

const DiscordConfigSchema = z.object({
  webhookUrl: z.url(),
})

const NotificationsConfigSchema = z.object({
  discord: DiscordConfigSchema.optional(),
})

const ConfigSchema = z.object({
  schedule: z.string().optional(),
  retention: z.number().int().positive().default(7),
  retentionMode: z.enum(RetentionMode).default(RetentionMode.Monthly),
  tempDir: z.string().optional().default("/tmp"),
  paths: z.array(z.string().min(1)).default([]),
  sqlite: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  sources: z.array(SourceSchema).default([]),
  destinations: z.array(DestinationSchema).default([]),
  notifications: NotificationsConfigSchema.optional(),
})

export { ConfigSchema }
