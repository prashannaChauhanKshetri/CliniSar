/** A4 bill, laid out like the clinic's paper bill book. */
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { getErrorMessage } from '../api/errors'
import { invoicesApi, type Invoice } from '../api/resources'
import { billNumber, rupeesAndPaisa, SOURCE_LABELS, totalLines } from '../lib/bills'
import { formatAD, formatBSNumeric, nepalDateOf } from '../lib/date'
import { amountInWords } from '../lib/money'
import classes from './print.module.css'
import { PrintHeader } from './PrintHeader'
import { PrintLayout, PrintProblem } from './PrintLayout'
import { useClinic } from './usePrintData'

function Amount({ value }: { value: string }) {
  const { rupees, paisa } = rupeesAndPaisa(value)
  return (
    <>
      <td className={classes.num}>{rupees}</td>
      <td className={classes.num}>{paisa}</td>
    </>
  )
}

export function InvoicePrint() {
  const { id = '' } = useParams()
  const bill = useQuery({ queryKey: ['invoices', id], queryFn: () => invoicesApi.get(id) })
  const clinic = useClinic()
  if (bill.error) return <PrintProblem message={getErrorMessage(bill.error)} />
  if (!bill.data || !clinic.data) return null
  return (
    <PrintLayout paper="A4" title={`Bill-${billNumber(bill.data)}`} ready>
      <InvoiceDocument bill={bill.data} address={clinic.data.address} phone={clinic.data.phone} />
    </PrintLayout>
  )
}

/** The bill itself (separate so it can be tested without loading data). */
export function InvoiceDocument({
  bill,
  address,
  phone,
}: {
  bill: Invoice
  address: string
  phone: string
}) {
  const day = nepalDateOf(bill.created_at)
  const lines = totalLines(bill)
  return (
    <>
      <PrintHeader
        issuer={{ name: bill.issuer_name, address, phone, pan: bill.issuer_pan }}
        title={`${SOURCE_LABELS[bill.source]} bill`}
      />
      <div className={classes.row}>
        <div>
          Bill No.: <b>{billNumber(bill)}</b>
          {bill.status === 'CANCELLED' && <b> (CANCELLED)</b>}
        </div>
        <div>
          Date: <b>{formatBSNumeric(day)}</b>{' '}
          <span className={classes.muted}>({formatAD(day)})</span>
        </div>
      </div>
      <div className={classes.fields}>
        <div>
          Name: <b>{bill.patient_name}</b>
        </div>
        <div>Phone: {bill.patient_phone || '—'}</div>
        <div>Address: {bill.patient_address || '—'}</div>
      </div>

      <table className={classes.lines}>
        <thead>
          <tr>
            <th style={{ width: 40 }}>S.N.</th>
            <th>Particular</th>
            <th className={classes.num} style={{ width: 50 }}>
              Qty.
            </th>
            <th className={classes.num} style={{ width: 90 }}>
              Rate
            </th>
            <th className={classes.num} style={{ width: 90 }}>
              Rs.
            </th>
            <th className={classes.num} style={{ width: 36 }}>
              Ps.
            </th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((line, index) => (
            <tr key={line.id}>
              <td>{index + 1}</td>
              <td>{line.description}</td>
              <td className={classes.num}>{line.quantity}</td>
              <td className={classes.num}>{Number(line.unit_price).toFixed(2)}</td>
              <Amount value={line.line_total} />
            </tr>
          ))}
          {lines.map((line) => (
            <tr key={line.label}>
              <td
                colSpan={4}
                className={classes.totalLabel}
                style={line.strong ? { fontWeight: 700 } : undefined}
              >
                {line.strong ? 'Net Amount' : line.label}
              </td>
              <Amount value={line.amount} />
            </tr>
          ))}
        </tbody>
      </table>
      <div className={classes.words}>
        In Words: <b>{amountInWords(Number(bill.total).toFixed(2))}</b>
      </div>

      <div className={classes.row} style={{ marginTop: 8 }}>
        <div>
          {bill.status === 'PAID'
            ? `Paid by ${bill.payment_method?.toLowerCase()}.`
            : bill.status === 'UNPAID'
              ? 'Not paid yet.'
              : `Cancelled: ${bill.cancel_reason}`}
          <div className={classes.muted}>Note: amounts paid are not refundable.</div>
        </div>
      </div>
      <div className={classes.signatures} style={{ justifyContent: 'flex-end' }}>
        <div>
          Issued by
          {bill.received_by_name && <div className={classes.muted}>{bill.received_by_name}</div>}
        </div>
      </div>
    </>
  )
}
