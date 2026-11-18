/** Ask for a reason before cancelling something (a visit, a bill, a lab order). */
import { Textarea } from '@mantine/core'
import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export function CancelWithReason({
  opened,
  title,
  message,
  loading,
  onConfirm,
  onClose,
}: {
  opened: boolean
  title: string
  message: string
  loading: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <ConfirmDialog
      opened={opened}
      title={title}
      message={message}
      confirmLabel="Cancel it"
      loading={loading}
      onClose={() => {
        setReason('')
        setError(null)
        onClose()
      }}
      onConfirm={() => {
        if (!reason.trim()) {
          setError('Write a short reason; it is kept with the record.')
          return
        }
        onConfirm(reason.trim())
        setReason('')
      }}
    >
      <Textarea
        label="Reason"
        required
        autosize
        minRows={2}
        value={reason}
        error={error}
        onChange={(event) => {
          setReason(event.currentTarget.value)
          setError(null)
        }}
      />
    </ConfirmDialog>
  )
}
