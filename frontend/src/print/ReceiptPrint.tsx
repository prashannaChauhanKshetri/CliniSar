/** Thermal receipt for the counter printer (80mm or 58mm). Only for paid bills. */
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { getErrorMessage } from '../api/errors'
import { invoicesApi, type Invoice } from '../api/resources'
import { billNumber, totalLines } from '../lib/bills'
import { formatBSNumeric, formatNepalTime, nepalDateOf } from '../lib/date'
import { formatRs } from '../lib/money'
import classes from './print.module.css'
import { PrintLayout, PrintProblem } from './PrintLayout'
import { useClinic } from './usePrintData'

export function ReceiptPrint() {
  const { id = '' } = useParams()
  const bill = useQuery({ queryKey: ['invoices', id], queryFn: () => invoicesApi.get(id) })
  const clinic = useClinic()
  if (bill.error) return <PrintProblem message={getErrorMessage(bill.error)} />
  if (!bill.data || !clinic.data) return null
  if (bill.data.status !== 'PAID')
    return <PrintProblem message="A receipt can only be printed for a paid bill." />
  return (
    <PrintLayout
      paper={clinic.data.receipt_width_mm}
      title={`Receipt-${billNumber(bill.data)}`}
      ready
    >
      <ReceiptDocument bill={bill.data} />
    </PrintLayout>
  )
}

/** Plain text style: one column, monospace, black only, no images. */
export function ReceiptDocument({ bill }: { bill: Invoice }) {
  return (
    <>
      <div className={classes.center}>
        <b>{bill.issuer_name}</b>
        {bill.issuer_pan && <div>PAN: {bill.issuer_pan}</div>}
      </div>
      <hr className={classes.thinRule} />
      <div>Receipt for bill {billNumber(bill)}</div>
      <div>Date: {formatBSNumeric(nepalDateOf(bill.paid_at ?? bill.created_at))}</div>
      <div>Patient: {bill.patient_name}</div>
      <hr className={classes.thinRule} />
      {bill.items.map((line) => (
        <div key={line.id}>
          <div>{line.description}</div>
          <div className={classes.row}>
            <span>
              {line.quantity} x {Number(line.unit_price).toFixed(2)}
            </span>
            <span>{Number(line.line_total).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <hr className={classes.thinRule} />
      {totalLines(bill).map((line) => (
        <div
          key={line.label}
          className={classes.row}
          style={line.strong ? { fontWeight: 700 } : undefined}
        >
          <span>{line.label}</span>
          <span>{line.strong ? formatRs(line.amount) : Number(line.amount).toFixed(2)}</span>
        </div>
      ))}
      <hr className={classes.thinRule} />
      <div>Paid by: {bill.payment_method}</div>
      {bill.paid_at && <div>{formatNepalTime(bill.paid_at)}</div>}
      <div className={classes.center} style={{ marginTop: 8 }}>
        Thank you
      </div>
    </>
  )
}
