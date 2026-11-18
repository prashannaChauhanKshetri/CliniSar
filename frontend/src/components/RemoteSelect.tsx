/**
 * A searchable dropdown whose options come from the server, e.g. "choose a patient"
 * by typing part of a name or phone number. Golden rule 5: pick from a list instead
 * of typing ids.
 */
import { Loader, Select, type SelectProps } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

export interface Option {
  value: string
  label: string
}

interface RemoteSelectProps extends Omit<SelectProps, 'data' | 'onChange' | 'value'> {
  /** Cache key prefix, e.g. "patients". */
  queryKey: string
  fetchOptions: (search: string) => Promise<Option[]>
  value: string | null
  onChange: (value: string | null, option: Option | null) => void
  /** Label of the current value when it is not in the first page of options. */
  selectedLabel?: string
}

export function RemoteSelect({
  queryKey,
  fetchOptions,
  value,
  onChange,
  selectedLabel,
  ...props
}: RemoteSelectProps) {
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 300) // wait until typing pauses
  const [remembered, setRemembered] = useState<Option | null>(
    value && selectedLabel ? { value, label: selectedLabel } : null,
  )
  const { data = [], isFetching } = useQuery({
    queryKey: [queryKey, 'options', debounced],
    queryFn: () => fetchOptions(debounced),
  })
  const options =
    remembered && !data.some((o) => o.value === remembered.value) ? [remembered, ...data] : data

  return (
    <Select
      searchable
      clearable
      data={options}
      value={value}
      onChange={(next) => {
        const option = options.find((o) => o.value === next) ?? null
        setRemembered(option)
        onChange(next, option)
      }}
      onSearchChange={setSearch}
      filter={({ options: all }) => all} // the server already filtered
      nothingFoundMessage={isFetching ? 'Searching…' : 'No matches'}
      rightSection={isFetching ? <Loader size={14} /> : undefined}
      {...props}
    />
  )
}
