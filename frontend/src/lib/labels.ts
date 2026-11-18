/** Turning API codes into words people read. */

/** "SAMPLE_COLLECTED" -> "Sample collected" */
export function statusLabel(status: string): string {
  const words = status.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Rows grouped by section, so sub-headings appear once, as on the printed report. */
export function withSectionHeadings<T extends { section: string }>(
  rows: T[],
): { heading: string | null; row: T }[] {
  let current = ''
  return rows.map((row) => {
    const heading = row.section && row.section !== current ? row.section : null
    current = row.section
    return { heading, row }
  })
}
