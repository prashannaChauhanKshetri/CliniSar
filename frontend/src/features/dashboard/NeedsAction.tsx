/** A short to-do list: only items that have something waiting are shown. */
import { Card, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { ChevronRight, CircleCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import classes from './Today.module.css'

export interface ActionItem {
  count: number | null | undefined
  one: string
  many: string
  to: string
}

export function NeedsAction({
  items,
  title = 'Needs action',
}: {
  items: ActionItem[]
  title?: string
}) {
  const navigate = useNavigate()
  const open = items.filter((item) => item.count)
  return (
    <Card padding="md">
      <Title order={2} fz={16} mb="sm">
        {title}
      </Title>
      {open.length === 0 ? (
        <Group gap="sm" c="success.7">
          <CircleCheck size={18} />
          <Text size="sm">All clear.</Text>
        </Group>
      ) : (
        <Stack gap={2}>
          {open.map((item) => (
            <UnstyledButton
              key={item.to + item.one}
              className={classes.action}
              onClick={() => navigate(item.to)}
            >
              <Text size="sm">
                <Text span fw={700} className="tabular-numbers">
                  {item.count}
                </Text>{' '}
                {item.count === 1 ? item.one : item.many}
              </Text>
              <ChevronRight size={16} />
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Card>
  )
}
