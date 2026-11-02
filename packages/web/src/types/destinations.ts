import type { ReactNode } from "react"
import type { DestinationType } from "@chest-backup/shared"

interface DestinationFormValue {
  type: DestinationType
  form: Record<string, unknown>
  update: (key: string, value: unknown) => void
}

interface DestinationFormProviderProps {
  form: Record<string, unknown>
  update: (key: string, value: unknown) => void
  children: ReactNode
}

export type { DestinationFormValue, DestinationFormProviderProps }
