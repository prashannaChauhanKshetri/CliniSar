/** Checking a prescription against the stock before dispensing (golden rule 5: prevent errors). */

export interface StockCheck {
  medicine: string
  name: string
  needed: number
  available: number
  short: number
}

/** For each line: how many are needed, how many are in stock, and how many are missing. */
export function checkStock(
  items: { medicine: string; medicine_name: string; quantity: number }[],
  availableById: Record<string, number | undefined>,
): StockCheck[] {
  return items.map((item) => {
    const available = availableById[item.medicine] ?? 0
    return {
      medicine: item.medicine,
      name: item.medicine_name,
      needed: item.quantity,
      available,
      short: Math.max(0, item.quantity - available),
    }
  })
}
