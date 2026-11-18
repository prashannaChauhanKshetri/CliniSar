/**
 * A4 prescription like the clinic's pads: the doctor's letterhead at the top (Nepali
 * left, English right), the patient line, Rx and medicines, and the clinic's name,
 * address and validity note in Nepali at the bottom.
 */
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { getErrorMessage } from '../api/errors'
import {
  doctorsApi,
  prescriptionsApi,
  type Clinic,
  type Doctor,
  type Prescription,
} from '../api/resources'
import { formatAD, formatBSNumeric } from '../lib/date'
import { ageSex } from '../lib/people'
import classes from './print.module.css'
import { PrintLayout, PrintProblem } from './PrintLayout'
import { useClinic } from './usePrintData'

export function PrescriptionPrint() {
  const { id = '' } = useParams()
  const prescription = useQuery({
    queryKey: ['prescriptions', id],
    queryFn: () => prescriptionsApi.get(id),
  })
  const doctorId = prescription.data?.doctor
  const doctor = useQuery({
    queryKey: ['doctors', doctorId],
    queryFn: () => doctorsApi.get(doctorId!),
    enabled: !!doctorId,
  })
  const clinic = useClinic()
  const error = prescription.error ?? doctor.error
  if (error) return <PrintProblem message={getErrorMessage(error)} />
  if (!prescription.data || !doctor.data || !clinic.data) return null
  return (
    <PrintLayout paper="A4" title={`Prescription-${prescription.data.patient_name}`} ready>
      <PrescriptionDocument
        prescription={prescription.data}
        doctor={doctor.data}
        clinic={clinic.data}
      />
    </PrintLayout>
  )
}

export function PrescriptionDocument({
  prescription,
  doctor,
  clinic,
}: {
  prescription: Prescription
  doctor: Doctor
  clinic: Clinic
}) {
  const englishName = `Dr. ${doctor.first_name} ${doctor.last_name}`
  return (
    <>
      <header className={classes.letterhead}>
        <div>
          {doctor.name_nepali && <div className={classes.doctorName}>{doctor.name_nepali}</div>}
        </div>
        <div className={classes.right}>
          <div className={classes.doctorName}>{englishName}</div>
          {doctor.qualifications && <div>{doctor.qualifications}</div>}
          {doctor.designation && (
            <div>
              <b>{doctor.designation}</b>
            </div>
          )}
          {doctor.license_number && <div>NMC No: {doctor.license_number}</div>}
        </div>
      </header>
      <hr className={classes.rule} />
      <div className={classes.right}>
        Date: <b>{formatBSNumeric(prescription.visit_date)}</b>{' '}
        <span className={classes.muted}>({formatAD(prescription.visit_date)})</span>
      </div>
      <div className={classes.fields}>
        <div>
          Name: <b>{prescription.patient_name}</b>
        </div>
        <div>Age/Sex: {ageSex(prescription.patient_age, prescription.patient_gender)}</div>
        <div>Address: {prescription.patient_address || '—'}</div>
      </div>
      <div>
        Diagnosis: <b>{prescription.diagnosis}</b>
      </div>

      <div className={classes.rx}>Rx</div>
      <table className={classes.lines}>
        <thead>
          <tr>
            <th style={{ width: 32 }}>S.N.</th>
            <th>Medicine</th>
            <th>Dose</th>
            <th>How often</th>
            <th className={classes.num}>Days</th>
            <th className={classes.num}>Qty</th>
            <th>Instructions</th>
          </tr>
        </thead>
        <tbody>
          {prescription.items.map((item, index) => (
            <tr key={item.id}>
              <td>{index + 1}</td>
              <td>
                <b>{item.medicine_name}</b>
                {item.medicine_form && <div className={classes.muted}>{item.medicine_form}</div>}
              </td>
              <td>{item.dosage}</td>
              <td>{item.frequency}</td>
              <td className={classes.num}>{item.duration_days}</td>
              <td className={classes.num}>{item.quantity}</td>
              <td>{item.instructions}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {prescription.notes && <p>Advice: {prescription.notes}</p>}

      <div className={classes.signatures} style={{ justifyContent: 'flex-end' }}>
        <div>{englishName}</div>
      </div>
      <footer className={classes.footer}>
        <div className={classes.issuer} style={{ fontSize: 16 }}>
          {clinic.name_nepali || clinic.name}
        </div>
        <div>{clinic.address_nepali || clinic.address}</div>
        {clinic.phone && <div>{clinic.phone}</div>}
        {clinic.prescription_note && (
          <div>
            <b>{clinic.prescription_note}</b>
          </div>
        )}
      </footer>
    </>
  )
}
