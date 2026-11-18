/**
 * A4 lab report like the clinic's report templates: patient box, a heading per
 * category ("HEMATOLOGY REPORT"), the result table with sub-headings, method,
 * specimen and interpretation, ">>END OF REPORT<<" and signature lines.
 */
import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { useParams } from 'react-router'
import { getErrorMessage } from '../api/errors'
import { labOrdersApi, type Clinic, type LabOrder, type LabOrderItem } from '../api/resources'
import { formatAD, formatBSNumeric, nepalDateOf } from '../lib/date'
import { withSectionHeadings } from '../lib/labels'
import { ageSex } from '../lib/people'
import classes from './print.module.css'
import { PrintHeader } from './PrintHeader'
import { PrintLayout, PrintProblem } from './PrintLayout'
import { useClinic } from './usePrintData'

export function LabReportPrint() {
  const { id = '' } = useParams()
  const order = useQuery({ queryKey: ['lab-orders', id], queryFn: () => labOrdersApi.get(id) })
  const clinic = useClinic()
  if (order.error) return <PrintProblem message={getErrorMessage(order.error)} />
  if (!order.data || !clinic.data) return null
  if (order.data.status !== 'COMPLETED')
    return <PrintProblem message="The report can be printed once the results are entered." />
  return (
    <PrintLayout paper="A4" title={`Lab-report-${order.data.lab_number}`} ready>
      <LabReportDocument order={order.data} clinic={clinic.data} />
    </PrintLayout>
  )
}

/** The lab's own name and PAN when it bills separately, otherwise the clinic's. */
function labIssuer(clinic: Clinic) {
  const separate = clinic.lab_bills_separately && clinic.lab_name
  return {
    name: separate ? clinic.lab_name : clinic.name,
    pan: separate ? clinic.lab_pan_number : clinic.pan_number,
    address: clinic.address,
    phone: clinic.phone,
  }
}

function dateText(timestamp: string | null) {
  if (!timestamp) return '—'
  const day = nepalDateOf(timestamp)
  return `${formatBSNumeric(day)} (${formatAD(day)})`
}

export function LabReportDocument({ order, clinic }: { order: LabOrder; clinic: Clinic }) {
  // Tests sharing a category are printed under one heading, in order.
  const categories = [...new Set(order.items.map((item) => item.category || 'LAB REPORT'))]
  return (
    <>
      <PrintHeader issuer={labIssuer(clinic)} title="Laboratory report" />
      <table className={classes.lines}>
        <tbody>
          <tr>
            <td>
              Patient&apos;s Name: <b>{order.patient_name}</b>
            </td>
            <td>Date of collection: {dateText(order.collected_at)}</td>
          </tr>
          <tr>
            <td>Address: {order.patient_address || '—'}</td>
            <td>Date of reporting: {dateText(order.completed_at)}</td>
          </tr>
          <tr>
            <td>Contact No: {order.patient_phone || '—'}</td>
            <td>Age/Sex: {ageSex(order.patient_age, order.patient_gender)}</td>
          </tr>
          <tr>
            <td>Consultant: {order.consultant}</td>
            <td>
              Lab No.: <b>{order.lab_number}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {categories.map((category) => (
        <section key={category}>
          <div className={classes.title}>{category}</div>
          {order.items
            .filter((item) => (item.category || 'LAB REPORT') === category)
            .map((item) => (
              <TestResults key={item.id} item={item} />
            ))}
        </section>
      ))}

      <div className={classes.end}>&gt;&gt;END OF REPORT&lt;&lt;</div>
      <div className={classes.signatures}>
        <div>
          Lab Technician
          {order.completed_by_name && (
            <div className={classes.muted}>{order.completed_by_name}</div>
          )}
        </div>
        <div>Lab Technologist</div>
      </div>
    </>
  )
}

function TestResults({ item }: { item: LabOrderItem }) {
  return (
    <div>
      <div>
        <b>{item.lab_test_name}</b>
        {item.method && <> · Method: {item.method}</>}
        {item.specimen && <> · Specimen: {item.specimen}</>}
      </div>
      <table className={classes.results}>
        <thead>
          <tr>
            <th>Name of Test</th>
            <th>Result</th>
            <th>Unit</th>
            <th>Reference Range</th>
          </tr>
        </thead>
        <tbody>
          {withSectionHeadings(item.results).map(({ heading, row }) => {
            return (
              <Fragment key={row.id}>
                {heading && (
                  <tr className={classes.section}>
                    <td colSpan={4}>{heading}</td>
                  </tr>
                )}
                <tr>
                  <td className={row.section ? classes.indent : undefined}>{row.name}</td>
                  <td className={row.flag === 'ABNORMAL' ? classes.abnormal : undefined}>
                    {row.value}
                    {row.flag === 'ABNORMAL' && ' *'}
                  </td>
                  <td>{row.unit}</td>
                  <td>{row.reference_range}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {item.results.some((row) => row.flag === 'ABNORMAL') && (
        <div className={classes.muted}>* outside the reference range</div>
      )}
      {item.interpretation && <p className={classes.muted}>{item.interpretation}</p>}
    </div>
  )
}
