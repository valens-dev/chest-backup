import { createContext, useContext } from "react"
import { toDestinationTypeFromForm } from "@/lib/enums"
import type { DestinationFormProviderProps, DestinationFormValue } from "@/types/destinations"

const DestinationFormContext = createContext<DestinationFormValue | null>(null)

const useDestinationForm = (): DestinationFormValue => {
  const ctx = useContext(DestinationFormContext)
  if (!ctx) throw new Error("useDestinationForm must be used within DestinationFormProvider")
  return ctx
}

const DestinationFormProvider = ({ form, update, children }: DestinationFormProviderProps) => {
  const type = toDestinationTypeFromForm(form)
  return <DestinationFormContext.Provider value={{ type, form, update }}>{children}</DestinationFormContext.Provider>
}

export { useDestinationForm, DestinationFormProvider }
