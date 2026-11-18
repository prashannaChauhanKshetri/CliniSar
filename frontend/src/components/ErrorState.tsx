import { Button, Stack, Text, ThemeIcon } from '@mantine/core'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { getErrorMessage } from '../api/errors'

/** Shown when a list or page could not load, with a way to try again. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Stack align="center" gap="sm" py="xl" role="alert">
      <ThemeIcon size={48} radius="xl" color="danger" variant="light" aria-hidden="true">
        <TriangleAlert size={24} />
      </ThemeIcon>
      <Text fw={600}>Could not load this</Text>
      <Text size="sm" c="dimmed" ta="center" maw={420}>
        {getErrorMessage(error)}
      </Text>
      {onRetry && (
        <Button variant="default" leftSection={<RefreshCw size={16} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </Stack>
  )
}
