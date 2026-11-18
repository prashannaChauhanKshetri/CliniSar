import { Center, Loader } from '@mantine/core'

/** Shown for the moment a page's code is being downloaded (pages load on first use). */
export function PageLoader() {
  return (
    <Center py={96} role="status" aria-label="Loading page">
      <Loader />
    </Center>
  )
}
