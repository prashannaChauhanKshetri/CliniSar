/**
 * The top of A4 bills and lab reports: issuer name, address, phone and PAN (in boxes,
 * as on the clinic's printed bill books), then the document title.
 */
import classes from './print.module.css'

export interface Issuer {
  name: string
  address: string
  phone: string
  pan: string
}

export function PanBoxes({ pan }: { pan: string }) {
  if (!pan) return null
  return (
    <span className={classes.panBoxes} aria-label={`PAN ${pan}`}>
      {pan.split('').map((digit, index) => (
        <span key={index}>{digit}</span>
      ))}
    </span>
  )
}

export function PrintHeader({ issuer, title }: { issuer: Issuer; title: string }) {
  return (
    <header>
      <div className={classes.center}>
        <div className={classes.issuer}>{issuer.name}</div>
        <div>{issuer.address}</div>
        {issuer.phone && <div>Phone: {issuer.phone}</div>}
      </div>
      {issuer.pan && (
        <div style={{ marginTop: 6 }}>
          PAN:
          <PanBoxes pan={issuer.pan} />
        </div>
      )}
      <hr className={classes.rule} />
      <div className={classes.title}>{title}</div>
    </header>
  )
}
