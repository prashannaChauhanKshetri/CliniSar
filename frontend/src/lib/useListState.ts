/**
 * List screens keep their page, search and filters in the address bar
 * (?page=2&search=ram&status=PAID). A reload keeps your place, Back works, and a link
 * can be shared. Golden rule 8: the screen remembers so the user does not have to.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export function useListState() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  /** Change one filter; any filter change goes back to page 1. */
  const setFilter = useCallback(
    (name: string, value: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value) next.set(name, value)
          else next.delete(name)
          if (name !== 'page') next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setPage = useCallback(
    (value: number) => setFilter('page', value > 1 ? String(value) : null),
    [setFilter],
  )

  return {
    page,
    setPage,
    get: (name: string) => params.get(name) ?? '',
    setFilter,
  }
}
