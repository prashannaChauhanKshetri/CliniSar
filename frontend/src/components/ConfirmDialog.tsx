import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  opened: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  /** "danger" for actions that cannot be undone (cancel, delete). */
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
  /** Extra inputs, e.g. a "reason" box. */
  children?: ReactNode
}

/**
 * Asks before anything that cannot be undone (golden rules 5 and 6: prevent errors,
 * allow reversal). The safe button ("Keep") is focused first, so pressing Enter by
 * accident does not cancel or delete anything.
 */
export function ConfirmDialog({
  opened,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{title}</Text>} size="md">
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        {children}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading} data-autofocus>
            Keep it
          </Button>
          <Button color={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
