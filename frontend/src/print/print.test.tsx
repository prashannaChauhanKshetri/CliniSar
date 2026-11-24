import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Clinic, Doctor, Invoice, LabOrder, Prescription } from '../api/resources'
import { renderWithProviders } from '../test/render'
import { InvoiceDocument } from './InvoicePrint'
import { LabReportDocument } from './LabReportPrint'
import { PrescriptionDocument } from './PrescriptionPrint'
import { PrintLayout } from './PrintLayout'
import { ReceiptDocument } from './ReceiptPrint'

const bill: Invoice = {
  id: 'b1',
  series: 'CLINIC',
  number: 90,
  issuer_name: 'Sunrise Health Clinic',
  issuer_pan: '100000001',
  source: 'PHARMACY',
  status: 'PAID',
  patient: 'p1',
  patient_name: 'Gita Chaudhary',
  patient_address: 'Rajapur, Bardiya',
  patient_phone: '',
  appointment: null,
  prescription: 'x',
  lab_order: null,
  items: [
    {
      id: 'l1',
      description: 'Paracetamol 500mg',
      quantity: 9,
      unit_price: '2.00',
      line_total: '18.00',
    },
  ],
  subtotal: '18.00',
  discount: '2.00',
  vat_rate: '13.00',
  vat_amount: '2.08',
  total: '18.08',
  payment_method: 'CASH',
  paid_at: '2026-11-18T13:17:00Z',
  received_by_name: 'Pharmacy Counter',
  cancel_reason: '',
  created_at: '2026-11-18T13:00:00Z',
}

const clinic = {
  name: 'Sunrise Health Clinic',
  name_nepali: 'सनराइज हेल्थ क्लिनिक',
  address: 'Nepalgunj-5',
  address_nepali: 'नेपालगन्ज-५',
  phone: '081-500001',
  pan_number: '100000001',
  prescription_note: 'यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।',
  lab_bills_separately: true,
  lab_name: 'Sunrise Path Lab',
  lab_pan_number: '100000002',
  receipt_width_mm: 80,
} as Clinic

afterEach(() => vi.restoreAllMocks())

describe('PrintLayout', () => {
  it.each([
    ['A4', '@page { size: A4; margin: 15mm; }'],
    [80, '@page { size: 80mm 297mm; margin: 0; }'],
    [58, '@page { size: 58mm 297mm; margin: 0; }'],
  ] as const)('injects the page rule for %s paper (before measuring)', (paper, rule) => {
    const { container } = renderWithProviders(
      <PrintLayout paper={paper} title="t" ready={false}>
        x
      </PrintLayout>,
    )
    const pageRules = [...container.ownerDocument.querySelectorAll('style')]
      .map((style) => style.textContent)
      .filter((text) => text?.startsWith('@page'))
    expect(pageRules).toEqual([rule])
  })

  it.each(['A4', 80, 58] as const)(
    'ends every %s printout with the black CliniSar logo (brand guide)',
    (paper) => {
      renderWithProviders(
        <PrintLayout paper={paper} title="t" ready={false}>
          x
        </PrintLayout>,
      )
      const logo = screen.getByRole('img', { name: 'CliniSar' })
      const fills = [...logo.querySelectorAll('g, circle')].map((part) => part.getAttribute('fill'))
      expect(fills.every((fill) => fill === '#000000')).toBe(true)
    },
  )

  it('opens the print dialog once, when the data is ready', async () => {
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve() },
      configurable: true,
    })
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderWithProviders(
      <PrintLayout paper="A4" title="Bill-90" ready>
        x
      </PrintLayout>,
    )
    await vi.waitFor(() => expect(print).toHaveBeenCalledOnce())
    expect(document.title).toBe('Bill-90')
  })

  it('gives a receipt a page exactly as long as its content before printing', async () => {
    Object.defineProperty(document, 'fonts', {
      value: { ready: Promise.resolve() },
      configurable: true,
    })
    vi.spyOn(window, 'print').mockImplementation(() => {})
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(378) // 100mm at 96 dpi
    const { container } = renderWithProviders(
      <PrintLayout paper={58} title="Receipt" ready>
        x
      </PrintLayout>,
    )
    await vi.waitFor(() =>
      expect(
        [...container.ownerDocument.querySelectorAll('style')].map((s) => s.textContent),
      ).toContain('@page { size: 58mm 105mm; margin: 0; }'),
    )
  })
})

describe('A4 bill', () => {
  it('has the paper bill layout: PAN boxes, Rs./Ps., totals, amount in words, issued by', async () => {
    renderWithProviders(<InvoiceDocument bill={bill} address="Nepalgunj-5" phone="081-500001" />)
    expect(await screen.findByText('Sunrise Health Clinic')).toBeInTheDocument()
    expect(screen.getByLabelText('PAN 100000001')).toBeInTheDocument()
    expect(screen.getByText('Pharmacy bill')).toBeInTheDocument()
    expect(screen.getByText('2083/08/02')).toBeInTheDocument() // numeric BS date
    expect(screen.getByText('VAT 13%')).toBeInTheDocument()
    expect(screen.getByText('Discount')).toBeInTheDocument()
    expect(screen.getByText('Net Amount')).toBeInTheDocument()
    expect(screen.getByText('Rupees Eighteen and Eight Paisa Only')).toBeInTheDocument()
    expect(screen.getByText('Pharmacy Counter')).toBeInTheDocument()
  })

  it('leaves VAT and discount lines out when the bill has none', async () => {
    renderWithProviders(
      <InvoiceDocument
        bill={{ ...bill, discount: '0.00', vat_rate: '0.00', vat_amount: '0.00', total: '18.00' }}
        address=""
        phone=""
      />,
    )
    await screen.findByText('Net Amount')
    expect(screen.queryByText(/^VAT/)).not.toBeInTheDocument()
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
    expect(screen.queryByText('Taxable amount')).not.toBeInTheDocument()
  })
})

describe('thermal receipt', () => {
  it('lists lines as "qty x price", totals, payment method and thank you', async () => {
    renderWithProviders(<ReceiptDocument bill={bill} />)
    expect(await screen.findByText('9 x 2.00')).toBeInTheDocument()
    expect(screen.getByText('Rs. 18.08')).toBeInTheDocument()
    expect(screen.getByText('Paid by: CASH')).toBeInTheDocument()
    expect(screen.getByText('Thank you')).toBeInTheDocument()
  })
})

describe('prescription', () => {
  it('has the doctor letterhead on top and the clinic in Nepali at the bottom', async () => {
    const prescription = {
      visit_date: '2026-11-18',
      patient_name: 'Gita Chaudhary',
      patient_age: 30,
      patient_gender: 'FEMALE',
      patient_address: 'Rajapur',
      diagnosis: 'Viral fever',
      notes: '',
      items: [
        {
          id: 'i',
          medicine_name: 'Paracetamol 500mg',
          medicine_form: 'Tablet',
          dosage: '500mg',
          frequency: '1-1-1',
          duration_days: 3,
          quantity: 9,
          instructions: '',
        },
      ],
    } as unknown as Prescription
    const doctor = {
      first_name: 'Anil',
      last_name: 'Sharma',
      name_nepali: 'डा. अनिल शर्मा',
      qualifications: 'M.B.B.S., M.D.',
      designation: 'Medical Officer',
      license_number: '12345',
    } as Doctor
    renderWithProviders(
      <PrescriptionDocument prescription={prescription} doctor={doctor} clinic={clinic} />,
    )
    expect(await screen.findByText('डा. अनिल शर्मा')).toBeInTheDocument()
    expect(screen.getByText('NMC No: 12345')).toBeInTheDocument()
    expect(screen.getByText('30 yrs / F', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Rx')).toBeInTheDocument()
    expect(screen.getByText('सनराइज हेल्थ क्लिनिक')).toBeInTheDocument()
    expect(screen.getByText('यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।')).toBeInTheDocument()
  })
})

describe('lab report', () => {
  it('uses the lab bill book name, sections, flags and the end mark', async () => {
    const order = {
      lab_number: 4,
      patient_name: 'Gita Chaudhary',
      patient_address: '',
      patient_phone: '',
      patient_age: 30,
      patient_gender: 'FEMALE',
      consultant: 'Self',
      collected_at: '2026-11-18T13:00:00Z',
      completed_at: '2026-11-18T14:00:00Z',
      completed_by_name: 'Lab Technician',
      items: [
        {
          id: 'i',
          lab_test_name: 'CBC',
          category: 'HEMATOLOGY REPORT',
          method: '',
          specimen: 'Whole Blood',
          interpretation: '',
          results: [
            {
              id: 'r1',
              name: 'Hemoglobin (Hb)',
              unit: 'gm%',
              reference_range: '11-16',
              section: '',
              value: '10.2',
              flag: 'ABNORMAL',
            },
            {
              id: 'r2',
              name: 'Neutrophils',
              unit: '%',
              reference_range: '45-75',
              section: 'Differential Leucocyte Count',
              value: '65',
              flag: 'NORMAL',
            },
          ],
        },
      ],
    } as unknown as LabOrder
    renderWithProviders(<LabReportDocument order={order} clinic={clinic} />)
    expect(await screen.findByText('Sunrise Path Lab')).toBeInTheDocument()
    expect(screen.getByText('HEMATOLOGY REPORT')).toBeInTheDocument()
    expect(screen.getByText('Differential Leucocyte Count')).toBeInTheDocument()
    expect(screen.getByText('10.2 *', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Consultant: Self')).toBeInTheDocument()
    expect(screen.getByText('>>END OF REPORT<<')).toBeInTheDocument()
    expect(screen.getByText('Lab Technologist')).toBeInTheDocument()
  })
})
