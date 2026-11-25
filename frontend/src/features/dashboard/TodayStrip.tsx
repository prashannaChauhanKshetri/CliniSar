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
      {/* Phones: two per row, or all three in one row (an odd count would leave a gap). */}
      <SimpleGrid
        className={classes.strip}
        cols={{ base: figures.length === 3 ? 3 : 2, md: figures.length }}
        spacing={1}
        verticalSpacing={1}
      >
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
              fz={{ base: 22, sm: 26 }}
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
