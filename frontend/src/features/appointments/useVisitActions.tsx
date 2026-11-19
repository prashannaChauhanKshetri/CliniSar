/**
 * Everything you can do to a visit, in one place, so the queue board, the visit list
 * and the dashboard behave identically: mark as seen, cancel (with a reason), and for
 * doctors write a prescription or order lab tests.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { appointmentsApi, type Appointment } from '../../api/resources'
import { notifyError, notifySuccess } from '../../lib/notify'
import { OrderLabTestsModal } from '../lab/OrderLabTestsModal'
import { WritePrescriptionModal } from '../prescriptions/WritePrescriptionModal'
import { CancelWithReason } from './CancelWithReason'

export interface VisitActions {
  markSeen: (visit: Appointment) => void
  /** Id of the visit being marked as seen right now (for a spinner). */
  markingId: string | null
  cancel: (visit: Appointment) => void
  prescribe: (visit: Appointment) => void
  orderTests: (visit: Appointment) => void
  /** The dialogs these actions open; render once on the page. */
  dialogs: React.ReactNode
}

export function useVisitActions(): VisitActions {
  const queryClient = useQueryClient()
  const [cancelling, setCancelling] = useState<Appointment | null>(null)
  const [prescribing, setPrescribing] = useState<Appointment | null>(null)
  const [ordering, setOrdering] = useState<Appointment | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['appointments'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const markSeen = useMutation({
    mutationFn: (visit: Appointment) => appointmentsApi.complete(visit.id),
    onSuccess: (visit) => {
      notifySuccess(`${visit.patient_name} seen.`)
      refresh()
    },
    onError: (error) => notifyError(error),
  })
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      appointmentsApi.cancel(id, reason),
    onSuccess: (visit) => {
      notifySuccess(`${visit.patient_name}'s visit cancelled. Its unpaid bill was cancelled too.`)
      setCancelling(null)
      refresh()
      void queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error) => notifyError(error),
  })

  return {
    markSeen: (visit) => markSeen.mutate(visit),
    markingId: markSeen.isPending ? (markSeen.variables?.id ?? null) : null,
    cancel: setCancelling,
    prescribe: setPrescribing,
    orderTests: setOrdering,
    dialogs: (
      <>
        <CancelWithReason
          opened={cancelling !== null}
          title="Cancel this visit?"
          message={`${cancelling?.patient_name}'s visit will be cancelled. An unpaid bill for it is cancelled too; a paid bill stays paid.`}
          loading={cancel.isPending}
          onConfirm={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
          onClose={() => setCancelling(null)}
        />
        {prescribing && (
          <WritePrescriptionModal appointment={prescribing} onClose={() => setPrescribing(null)} />
        )}
        {ordering && (
          <OrderLabTestsModal appointment={ordering} onClose={() => setOrdering(null)} />
        )}
      </>
    ),
  }
}
