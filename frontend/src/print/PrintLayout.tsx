/**
 * The frame for every printout: no sidebar, top bar or buttons; its own @page rule
 * (A4 with 15mm margins, or a thermal roll as long as the receipt); and it opens the print dialog once the
 * document is ready. Every printout ends with the black CliniSar logo (brand guide:
 * black is the version for thermal receipts and A4 printouts).
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Logo } from '../components/Logo'
import classes from './print.module.css'

export type Paper = 'A4' | 80 | 58

const A4_RULE = '@page { size: A4; margin: 15mm; }'
const MM_PER_PX = 25.4 / 96

/**
 * Thermal rolls have no fixed length. The brief's "size: 80mm auto" is not accepted by
 * browsers (Chrome falls back to Letter paper, as a PDF test showed), so the page is
 * given the receipt's real height, measured just before printing.
 */
function thermalRule(width: 80 | 58, heightMm: number): string {
  return `@page { size: ${width}mm ${heightMm}mm; margin: 0; }`
}

export function PrintLayout({
  paper,
  title,
  ready,
  children,
}: {
  paper: Paper
  /** Window title; also the suggested file name when "saving as PDF". */
  title: string
  /** True once all data has loaded; the print dialog opens then. */
  ready: boolean
  children: ReactNode
}) {
  const printed = useRef(false)
  const paperRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement>(null)

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    if (!ready || printed.current) return
    printed.current = true // React runs effects twice in development; print only once
    // Wait for the fonts so the printout uses Inter, then size a receipt and print.
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => {
        if (paper !== 'A4' && paperRef.current && styleRef.current) {
          const heightMm = Math.ceil(paperRef.current.scrollHeight * MM_PER_PX) + 4
          styleRef.current.textContent = thermalRule(paper, heightMm)
        }
        window.print()
      }),
    )
  }, [ready, paper])

  const paperClass =
    paper === 'A4' ? classes.a4 : `${classes.thermal} ${paper === 58 ? classes.w58 : classes.w80}`
  return (
    <div className={classes.screen}>
      <style ref={styleRef}>{paper === 'A4' ? A4_RULE : thermalRule(paper, 297)}</style>
      <div ref={paperRef} className={`${classes.paper} ${paperClass}`}>
        {children}
        {/* size 20 keeps the full logo at the guide's 96 px minimum width, even on a
            58 mm roll. Measured with the receipt, so the roll length includes it. */}
        <div className={classes.brand}>
          <Logo variant="black" size={20} />
        </div>
      </div>
    </div>
  )
}

/** Shown in place of a printout that cannot be printed (not found, not allowed, not paid). */
export function PrintProblem({ message }: { message: string }) {
  return (
    <div className={classes.screen}>
      <div className={`${classes.paper} ${classes.a4}`} role="alert">
        <p>{message}</p>
      </div>
    </div>
  )
}
