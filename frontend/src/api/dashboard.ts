/** Calls to the dashboard endpoint. */
import { api } from './client'
import type { DashboardSummary, SummaryRange } from './types'

export async function fetchSummary(range: SummaryRange): Promise<DashboardSummary> {
  return (await api.get<DashboardSummary>('/dashboard/summary/', { params: { range } })).data
}
