import { Card, EmptyState } from '@mantine/core'
import { Hammer } from 'lucide-react'
import { useLocation } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { screenFor } from '../routes/navigation'

/** Stands in for the screens built in phase 10, so menus and access can be tried now. */
export function PlaceholderPage() {
  const { pathname } = useLocation()
  const screen = screenFor(pathname)
  return (
    <>
      <PageHeader title={screen?.label ?? 'CliniSar'} description={screen?.description} />
      <Card>
        <EmptyState
          icon={<Hammer size={28} />}
          title="This screen is built in the next step"
          description="The menu, access rules and layout already work; the content comes in phase 10."
          py="xl"
        />
      </Card>
    </>
  )
}
