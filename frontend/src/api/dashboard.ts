/** Calls to the dashboard endpoint. */
import { api } from './client'
import type { DashboardSummary } from './types'

export async function fetchSummary(range: 'week' | 'month'): Promise<DashboardSummary> {
  return (await api.get<DashboardSummary>('/dashboard/summary/', { params: { range } })).data
}
