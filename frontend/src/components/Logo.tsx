/**
 * The CliniSar logo, drawn exactly as in the brand guide (docs/BRAND.md).
 *
 * The mark is a medical cross split into five parts: the four arms are the modules and
 * the clinics, the circle in the middle is the shared platform they all run on. सार
 * (sār) means essence or core: the circle is the "Sar" in CliniSar.
 *
 * Geometry on a 48 x 48 grid: arms 14 x 14 with corner radius 3.5, 3 units apart; the
 * core is a circle 14 across. The same shapes are in docs/brand/*.svg and favicon.svg.
 */
import { BRAND } from '../theme'
import classes from './Logo.module.css'

/** Where the logo sits decides its colours (the guide allows no other recolouring). */
export type LogoVariant = 'colour' | 'onBlue' | 'black'

const COLOURS: Record<LogoVariant, { arms: string; core: string; word: string }> = {
  // Light backgrounds: brand blue arms, navy core and wordmark.
  colour: { arms: BRAND.primary, core: BRAND.navy, word: BRAND.navy },
  // On brand blue (sidebar, sign-in panel): white arms and wordmark, navy core.
  onBlue: { arms: '#FFFFFF', core: BRAND.navy, word: '#FFFFFF' },
  // Thermal receipts, A4 printouts, stamps: all black.
  black: { arms: '#000000', core: '#000000', word: '#000000' },
}

// The four arms: top, left, right, bottom (x, y on the 48-unit grid).
const ARMS = [
  [17, 0],
  [0, 17],
  [34, 17],
  [17, 34],
]

/** The mark alone. Smallest allowed size: 16 px. */
export function LogoMark({ size, variant = 'colour' }: { size: number; variant?: LogoVariant }) {
  const colours = COLOURS[variant]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g fill={colours.arms}>
        {ARMS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="14" height="14" rx="3.5" />
        ))}
      </g>
      <circle cx="24" cy="24" r="7" fill={colours.core} />
    </svg>
  )
}

/**
 * Mark + wordmark. `size` is the wordmark's font size in px; the guide's proportions
 * follow from it: mark height = 1.1 x wordmark size, and the gap between them is one
 * arm's width (14/48 of the mark). Keep the full logo at least 96 px wide (size >= 18).
 */
export function Logo({ variant = 'colour', size = 22 }: { variant?: LogoVariant; size?: number }) {
  const mark = Math.round(size * 1.1)
  return (
    <div
      role="img"
      aria-label="CliniSar"
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round((mark * 14) / 48) }}
    >
      <LogoMark size={mark} variant={variant} />
      <span className={classes.wordmark} style={{ fontSize: size, color: COLOURS[variant].word }}>
        CliniSar
      </span>
    </div>
  )
}
