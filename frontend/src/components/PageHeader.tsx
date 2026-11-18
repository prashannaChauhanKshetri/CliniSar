import { Anchor, Group, Stack, Text, Title } from '@mantine/core'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Buttons on the right, e.g. "New appointment". */
  actions?: ReactNode
  /** A "back to list" link for detail pages, so users always know where they are. */
  back?: { to: string; label: string }
}

/** The same title block on every page: where am I, and what can I do here. */
export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <Stack gap="sm" mb="lg">
      {back && (
        <Anchor component={Link} to={back.to} size="sm" c="dimmed">
          <Group gap={4} wrap="nowrap">
            <ChevronLeft size={16} aria-hidden="true" />
            {back.label}
          </Group>
        </Anchor>
      )}
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap={4}>
          <Title order={1} fz={24}>
            {title}
          </Title>
          {description && (
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          )}
        </Stack>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
    </Stack>
  )
}
