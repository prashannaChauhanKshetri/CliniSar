/** My profile: your own name and phone, and changing your password. */
import {
  Button,
  Card,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { profileApi } from '../../api/resources'
import { ROLE_LABELS } from '../../api/types'
import { DetailList } from '../../components/DetailList'
import { PageHeader } from '../../components/PageHeader'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'
import { useAuth } from '../auth/useAuth'

export function ProfilePage() {
  const { user, reloadUser } = useAuth()
  const details = useForm({
    defaultValues: {
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      phone: user?.phone ?? '',
    },
  })
  const password = useForm({
    defaultValues: { current_password: '', new_password: '', repeat: '' },
  })

  const saveDetails = useMutation({
    mutationFn: profileApi.update,
    onSuccess: async () => {
      await reloadUser()
      notifySuccess('Your details were saved.')
    },
    onError: (error) =>
      showServerFieldErrors(error, details.setError, ['first_name', 'last_name', 'phone']) ||
      notifyError(error),
  })
  const changePassword = useMutation({
    mutationFn: profileApi.changePassword,
    onSuccess: () => {
      password.reset()
      notifySuccess('Your password was changed. Use the new one next time you sign in.')
    },
    onError: (error) =>
      showServerFieldErrors(error, password.setError, ['current_password', 'new_password']) ||
      notifyError(error),
  })
  if (!user) return null

  return (
    <>
      <PageHeader title="My profile" description="Your details and password." />
      <Stack gap="lg">
        <Card>
          <DetailList
            items={[
              ['Email', user.email],
              ['Role', ROLE_LABELS[user.role]],
              ['Clinic', user.clinic?.name],
            ]}
          />
        </Card>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Card
            component="form"
            onSubmit={details.handleSubmit((values) => saveDetails.mutate(values))}
            noValidate
          >
            <Stack gap="md">
              <Title order={2} fz={16}>
                Your details
              </Title>
              <TextInput
                label="First name"
                required
                error={details.formState.errors.first_name?.message}
                {...details.register('first_name', { required: 'Enter your first name.' })}
              />
              <TextInput
                label="Last name"
                required
                error={details.formState.errors.last_name?.message}
                {...details.register('last_name', { required: 'Enter your last name.' })}
              />
              <TextInput
                label="Phone"
                error={details.formState.errors.phone?.message}
                {...details.register('phone')}
              />
              <Group>
                <Button type="submit" loading={saveDetails.isPending}>
                  Save details
                </Button>
              </Group>
            </Stack>
          </Card>
          <Card
            component="form"
            onSubmit={password.handleSubmit(({ current_password, new_password }) =>
              changePassword.mutate({ current_password, new_password }),
            )}
            noValidate
          >
            <Stack gap="md">
              <Title order={2} fz={16}>
                Change password
              </Title>
              <Text size="sm" c="dimmed">
                At least 8 characters, not only numbers, and not a common password.
              </Text>
              <PasswordInput
                label="Current password"
                autoComplete="current-password"
                required
                error={password.formState.errors.current_password?.message}
                {...password.register('current_password', {
                  required: 'Enter your current password.',
                })}
              />
              <PasswordInput
                label="New password"
                autoComplete="new-password"
                required
                error={password.formState.errors.new_password?.message}
                {...password.register('new_password', {
                  required: 'Enter a new password.',
                  minLength: { value: 8, message: 'Use at least 8 characters.' },
                })}
              />
              <PasswordInput
                label="New password again"
                autoComplete="new-password"
                required
                error={password.formState.errors.repeat?.message}
                {...password.register('repeat', {
                  validate: (value, all) =>
                    value === all.new_password || 'The two new passwords are different.',
                })}
              />
              <Group>
                <Button type="submit" loading={changePassword.isPending}>
                  Change password
                </Button>
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>
    </>
  )
}
