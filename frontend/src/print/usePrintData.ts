/** Loads what a printout needs and the clinic's details (name, address, PAN, receipt width). */
import { useQuery } from '@tanstack/react-query'
import { clinicApi } from '../api/resources'

export function useClinic() {
  return useQuery({ queryKey: ['clinic'], queryFn: clinicApi.get, staleTime: 5 * 60_000 })
}
