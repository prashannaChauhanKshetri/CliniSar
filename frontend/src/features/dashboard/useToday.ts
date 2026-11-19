/** Data shared by the "today" dashboards. */
import { useQuery } from '@tanstack/react-query'
import { fetchSummary } from '../../api/dashboard'
import { appointmentsApi } from '../../api/resources'
import { todayInNepal } from '../../lib/date'

export function useTodaySummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary', 'today'],
    queryFn: () => fetchSummary('today'),
    refetchInterval: 60_000,
  })
}

export function useTodayVisits() {
  const today = todayInNepal()
  return useQuery({
    queryKey: ['appointments', { date: today, page_size: 100 }],
    queryFn: () => appointmentsApi.list({ date: today, page_size: 100 }),
    refetchInterval: 30_000,
  })
}
