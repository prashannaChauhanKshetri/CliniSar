/**
 * The sign-in page. Email and password only: patients do not log in, and staff get
 * their password from the clinic admin (there is no email reset in this project).
 */
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Box,
  Button,
  Card,
  Center,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { CalendarDays, FlaskConical, Info, Pill, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate, type Location } from 'react-router'
import { z } from 'zod'
import { getErrorMessage } from '../api/errors'
import { FullPageLoader } from '../components/FullPageLoader'
import { Logo } from '../components/Logo'
import { useAuth } from '../features/auth/useAuth'

const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address, e.g. name@clinic.com.' }),
  password: z.string().min(1, { error: 'Enter your password.' }),
})
type LoginForm = z.infer<typeof loginSchema>

const FEATURES = [
  { icon: CalendarDays, text: 'Bookings and the walk-in queue in one place' },
  { icon: Pill, text: 'Pharmacy stock by batch, first to expire is first out' },
  { icon: FlaskConical, text: 'Lab reports and bills, with or without VAT' },
]

export function LoginPage() {
  const { status, notice, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  })

  if (status === 'checking') return <FullPageLoader />
  if (status === 'signed-in') return <Navigate to="/dashboard" replace />

  const cameFrom = (location.state as { from?: Location } | null)?.from?.pathname
  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setServerError(null)
    try {
      await signIn(email, password)
      navigate(cameFrom && cameFrom !== '/login' ? cameFrom : '/dashboard', { replace: true })
    } catch (error) {
      setServerError(getErrorMessage(error))
    }
  })

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} mih="100vh">
      <Box bg="primary.6" c="white" p="xl" visibleFrom="md">
        <Stack justify="space-between" h="100%" maw={440} mx="auto" py="xl">
          <Logo onDark size="lg" />
          <Stack gap="lg">
            <Title order={1} c="white" fz={32} lh={1.25}>
              Clinic work, all in one place.
            </Title>
            <Stack gap="md">
              {FEATURES.map(({ icon: Icon, text }) => (
                <Group key={text} gap="md" wrap="nowrap">
                  <ThemeIcon size={40} radius="md" color="white" variant="light" aria-hidden="true">
                    <Icon size={20} color="white" />
                  </ThemeIcon>
                  <Text c="white">{text}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
          <Text size="sm" c="primary.1">
            Dates are shown in Bikram Sambat, with the AD date beside them.
          </Text>
        </Stack>
      </Box>

      <Center bg="var(--clinisar-page)" p={{ base: 'md', sm: 'xl' }}>
        <Card w="100%" maw={420} p="xl">
          <form onSubmit={onSubmit} noValidate>
            <Stack gap="lg">
              <Box hiddenFrom="md">
                <Logo />
              </Box>
              <Stack gap={4}>
                <Title order={2} fz={22}>
                  Sign in
                </Title>
                <Text size="sm" c="dimmed">
                  Use the email and password your clinic admin gave you.
                </Text>
              </Stack>

              {notice && !serverError && (
                <Alert color="primary" variant="light" icon={<Info size={18} />}>
                  {notice}
                </Alert>
              )}
              {serverError && (
                <Alert
                  color="danger"
                  variant="light"
                  icon={<TriangleAlert size={18} />}
                  role="alert"
                >
                  {serverError}
                </Alert>
              )}

              <TextInput
                label="Email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                error={form.formState.errors.email?.message}
                {...form.register('email')}
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                required
                error={form.formState.errors.password?.message}
                {...form.register('password')}
              />
              <Button type="submit" fullWidth loading={form.formState.isSubmitting}>
                Sign in
              </Button>
              <Text size="xs" c="dimmed" ta="center">
                Forgot your password? Ask your clinic admin to set a new one.
              </Text>
            </Stack>
          </form>
        </Card>
      </Center>
    </SimpleGrid>
  )
}
