import { useQuery } from '@tanstack/react-query'
import { patientsApi } from '../../api/resources'

/** One patient's history (GET patients/<id>/history/), shared by the panel and the doctor's card. */
export function usePatientHistory(patientId: string) {
  return useQuery({
    queryKey: ['patients', patientId, 'history'],
    queryFn: () => patientsApi.history(patientId),
  })
}
