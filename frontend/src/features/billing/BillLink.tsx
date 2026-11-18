/** "Open the bill" link for a visit, prescription or lab order (if the role may see bills). */
import { Button } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { Link } from 'react-router'
import { invoicesApi } from '../../api/resources'
import { canOpen } from '../../routes/navigation'
import { useAuth } from '../auth/useAuth'

export function BillLink({
  filter,
}: {
  filter: { prescription?: string; lab_order?: string; appointment?: string }
}) {
  const { user } = useAuth()
  const allowed = !!user && canOpen(user.role, '/invoices')
  const query = useQuery({
    queryKey: ['invoices', filter],
    queryFn: () => invoicesApi.list(filter),
    enabled: allowed,
  })
  const bill = query.data?.results[0]
  if (!allowed || !bill) return null
  return (
    <Button
      component={Link}
      to={`/invoices/${bill.id}`}
      variant="default"
      leftSection={<Receipt size={16} />}
    >
      Bill #{bill.series === 'LAB' ? 'L-' : ''}
      {bill.number}
    </Button>
  )
}
