import { Button, Card, EmptyState } from '@mantine/core'
import { Compass } from 'lucide-react'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass size={28} />}
        title="Page not found"
        description="The address may be mistyped, or the page has moved."
        py="xl"
      >
        <Button component={Link} to="/dashboard" variant="default">
          Back to the dashboard
        </Button>
      </EmptyState>
    </Card>
  )
}
