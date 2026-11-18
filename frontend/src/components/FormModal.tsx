import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import type { FormEvent, ReactNode } from 'react'

interface FormModalProps {
  opened: boolean
  onClose: () => void
  title: string
  submitLabel: string
  submitting: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  size?: string
}

/**
 * Every "add / edit" dialog looks and behaves the same: title, fields 16px apart,
 * Cancel on the left of the main button, Enter submits, Esc or Cancel leaves without
 * saving (golden rules 1, 6 and 7).
 */
export function FormModal({
  opened,
  onClose,
  title,
  submitLabel,
  submitting,
  onSubmit,
  children,
  size = 'lg',
}: FormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600}>{title}</Text>} size={size}>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          {children}
          <Group justify="flex-end" gap="sm" mt="sm">
            <Button variant="default" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
