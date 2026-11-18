import { SimpleGrid, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

/** Label/value pairs on detail pages, e.g. "Phone: 98...". */
export function DetailList({ items, cols = 3 }: { items: [string, ReactNode][]; cols?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: cols }} spacing="lg" verticalSpacing="md">
      {items.map(([label, value]) => (
        <Stack key={label} gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.4}>
            {label}
          </Text>
          <Text size="sm" component="div">
            {value === '' || value === null || value === undefined ? '—' : value}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  )
}
