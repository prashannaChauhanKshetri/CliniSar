import { Group, Text } from '@mantine/core'

/**
 * The CliniSar text logo: a rounded square with "CS" and the name. Original and simple.
 * `onDark` is for the blue sidebar.
 */
export function Logo({ onDark = false, size = 'md' }: { onDark?: boolean; size?: 'md' | 'lg' }) {
  const mark = size === 'lg' ? 44 : 36
  return (
    <Group gap="sm" wrap="nowrap" aria-label="CliniSar">
      <svg width={mark} height={mark} viewBox="0 0 32 32" aria-hidden="true">
        <rect
          width="32"
          height="32"
          rx="8"
          fill={onDark ? '#FFFFFF' : 'var(--mantine-color-primary-6)'}
        />
        <text
          x="16"
          y="21.5"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fontFamily="inherit"
          fill={onDark ? 'var(--mantine-color-primary-6)' : '#FFFFFF'}
        >
          CS
        </text>
      </svg>
      <Text fw={700} fz={size === 'lg' ? 26 : 22} c={onDark ? 'white' : 'primary.6'} lh={1}>
        CliniSar
      </Text>
    </Group>
  )
}
