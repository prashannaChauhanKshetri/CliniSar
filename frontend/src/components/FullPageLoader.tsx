import { Center, Loader, Stack, Text } from '@mantine/core'

/** Shown while the app checks whether the user is still signed in. */
export function FullPageLoader({ message = 'Loading CliniSar…' }: { message?: string }) {
  return (
    <Center h="100vh" bg="var(--clinisar-page)">
      <Stack align="center" gap="md" role="status" aria-live="polite">
        <Loader />
        <Text c="dimmed" size="sm">
          {message}
        </Text>
      </Stack>
    </Center>
  )
}
