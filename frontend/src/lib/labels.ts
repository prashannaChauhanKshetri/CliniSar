/** Turning API codes into words people read. */

/** "SAMPLE_COLLECTED" -> "Sample collected" */
export function statusLabel(status: string): string {
  const words = status.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
