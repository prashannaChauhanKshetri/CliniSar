import { Text, type TextProps } from '@mantine/core'
import { formatRs } from '../lib/money'

/** A rupee amount, digits aligned in tables. */
export function Money({ amount, ...props }: { amount: string | number } & TextProps) {
  return (
    <Text span className="tabular-numbers" size="sm" {...props}>
      {formatRs(amount)}
    </Text>
  )
}
