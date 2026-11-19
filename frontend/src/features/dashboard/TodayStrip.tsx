/** Today's few numbers in one strip, each one a link to where the work is. */
import { Card, SimpleGrid, Text, UnstyledButton } from '@mantine/core'
import { useNavigate } from 'react-router'
import classes from './Today.module.css'

export interface Figure {
  label: string
  value: string | number | undefined
  to?: string
  /** Draw attention (e.g. bills waiting). */
  alert?: boolean
}

export function TodayStrip({ figures }: { figures: Figure[] }) {
  const navigate = useNavigate()
  return (
    <Card padding={0}>
      <SimpleGrid cols={{ base: 2, md: figures.length }} spacing={0}>
        {figures.map((figure) => (
          <UnstyledButton
            key={figure.label}
            className={classes.figure}
            disabled={!figure.to}
            onClick={() => figure.to && navigate(figure.to)}
          >
            <Text size="xs" c="dimmed" fw={500}>
              {figure.label}
            </Text>
            <Text
              fz={26}
              fw={700}
              lh={1.2}
              className="tabular-numbers"
              c={figure.alert && figure.value ? 'danger.6' : undefined}
            >
              {figure.value ?? '–'}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Card>
  )
}
