import { DestinationType } from "@chest-backup/shared"
import { useDestinationForm } from "@/hooks/use-destination-form"
import { SftpFields } from "./sftp-fields"
import { S3Fields } from "./s3-fields"
import { FtpFields } from "./ftp-fields"

const DestinationTypeFields = () => {
  const { type } = useDestinationForm()

  if (type === DestinationType.Sftp) return <SftpFields />
  if (type === DestinationType.S3) return <S3Fields />
  if (type === DestinationType.Ftp) return <FtpFields />
  return null
}

export { DestinationTypeFields }
