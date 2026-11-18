import { Button, Card, EmptyState } from '@mantine/core'
import { Lock } from 'lucide-react'
import { Link } from 'react-router'

export function ForbiddenPage() {
  return (
    <Card>
      <EmptyState
        icon={<Lock size={28} />}
        title="This page is not for your role"
        description="Ask your clinic admin if you think you should have access."
        py="xl"
      >
        <Button component={Link} to="/dashboard" variant="default">
          Back to the dashboard
        </Button>
      </EmptyState>
    </Card>
  )
}
