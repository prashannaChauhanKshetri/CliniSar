/**
 * A Bikram Sambat date picker. People pick a BS date; the form receives the AD date
 * ("YYYY-MM-DD") that the API expects. Built on lib/date.ts so the whole app uses one
 * calendar source. (Mantine's own picker is AD-only, and the BS picker packages on npm
 * either do not support React 19 or bundle a different calendar table.)
 *
 * Keyboard: arrows move by day/week, Page Up/Down by month, Enter picks, Esc closes.
 */
import {
  ActionIcon,
  Button,
  Group,
  InputBase,
  NativeSelect,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  BS_MONTHS,
  FIRST_BS_YEAR,
  LAST_BS_YEAR,
  WEEKDAYS,
  adToBs,
  addDays,
  daysInBsMonth,
  formatAD,
  formatBS,
  toAD,
  todayInNepal,
  weekdayOf,
} from '../lib/date'
import classes from './BsDatePicker.module.css'

interface BsDatePickerProps {
  label: string
  /** The chosen date as AD "YYYY-MM-DD", or null. */
  value: string | null
  onChange: (isoDate: string | null) => void
  error?: ReactNode
  description?: ReactNode
  required?: boolean
  clearable?: boolean
  disabled?: boolean
  placeholder?: string
  /** Earliest/latest allowed AD dates, e.g. expiry dates must be in the future. */
  minDate?: string
  maxDate?: string
}

interface MonthView {
  year: number
  month: number
}

const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
}

function viewOf(isoDate: string): MonthView {
  const { year, month } = adToBs(isoDate)
  return { year, month }
}

function shiftMonth(view: MonthView, by: number): MonthView | null {
  const index = view.year * 12 + (view.month - 1) + by
  const year = Math.floor(index / 12)
  if (year < FIRST_BS_YEAR || year > LAST_BS_YEAR) return null
  return { year, month: (index % 12) + 1 }
}

const YEARS = Array.from({ length: LAST_BS_YEAR - FIRST_BS_YEAR + 1 }, (_, i) =>
  String(FIRST_BS_YEAR + i),
)

export function BsDatePicker({
  label,
  value,
  onChange,
  error,
  description,
  required,
  clearable = false,
  disabled,
  placeholder = 'Pick a date',
  minDate,
  maxDate,
}: BsDatePickerProps) {
  const today = todayInNepal()
  const [opened, setOpened] = useState(false)
  const [view, setView] = useState<MonthView>(() => viewOf(value ?? today))
  const [focused, setFocused] = useState<string>(value ?? today)
  const gridRef = useRef<HTMLDivElement>(null)

  const isAllowed = (iso: string) => (!minDate || iso >= minDate) && (!maxDate || iso <= maxDate)

  // Move keyboard focus to the highlighted day after it changes.
  useEffect(() => {
    if (!opened) return
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focused}"]`)?.focus()
  }, [focused, opened, view])

  function open() {
    const start = value ?? today
    setView(viewOf(start))
    setFocused(start)
    setOpened(true)
  }

  function pick(iso: string) {
    if (!isAllowed(iso)) return
    onChange(iso)
    setOpened(false)
  }

  function moveFocus(iso: string) {
    try {
      setView(viewOf(iso))
      setFocused(iso)
    } catch {
      // Outside BS 2000-2099: stay where we are.
    }
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = KEY_STEPS[event.key]
    if (step) {
      event.preventDefault()
      moveFocus(addDays(focused, step))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const next = shiftMonth(view, event.key === 'PageUp' ? -1 : 1)
      if (next) moveFocus(toAD({ ...next, day: 1 }))
    }
  }

  function changeMonth(next: MonthView | null) {
    if (!next) return
    setView(next)
    setFocused(toAD({ ...next, day: 1 }))
  }

  const firstDay = toAD({ ...view, day: 1 })
  const days = Array.from({ length: daysInBsMonth(view.year, view.month) }, (_, i) =>
    addDays(firstDay, i),
  )
  const blanks = weekdayOf(firstDay) // weeks start on Sunday

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      trapFocus
      returnFocus
      width={312}
    >
      <Popover.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          label={label}
          required={required}
          disabled={disabled}
          error={error}
          description={description ?? (value ? `AD ${formatAD(value)}` : undefined)}
          rightSection={<CalendarDays size={16} aria-hidden="true" />}
          rightSectionPointerEvents="none"
          onClick={() => (opened ? setOpened(false) : open())}
          aria-haspopup="dialog"
        >
          {value ? (
            formatBS(value)
          ) : (
            <Text span c="dimmed" size="sm">
              {placeholder}
            </Text>
          )}
        </InputBase>
      </Popover.Target>

      <Popover.Dropdown p="md" role="dialog" aria-label={`Choose ${label}`}>
        <Stack gap="sm">
          <Group gap="xs" wrap="nowrap">
            <ActionIcon
              variant="subtle"
              onClick={() => changeMonth(shiftMonth(view, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </ActionIcon>
            <NativeSelect
              aria-label="Month"
              size="xs"
              flex={1}
              value={String(view.month)}
              data={BS_MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
              onChange={(event) =>
                changeMonth({ ...view, month: Number(event.currentTarget.value) })
              }
            />
            <NativeSelect
              aria-label="Year"
              size="xs"
              w={84}
              value={String(view.year)}
              data={YEARS}
              onChange={(event) =>
                changeMonth({ ...view, year: Number(event.currentTarget.value) })
              }
            />
            <ActionIcon
              variant="subtle"
              onClick={() => changeMonth(shiftMonth(view, 1))}
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </ActionIcon>
          </Group>

          <SimpleGrid cols={7} spacing={2} verticalSpacing={2} ref={gridRef}>
            {WEEKDAYS.map((day) => (
              <Text key={day} size="xs" c="dimmed" ta="center" fw={600} py={4} aria-hidden="true">
                {day}
              </Text>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {days.map((iso, index) => {
              const selected = iso === value
              const allowed = isAllowed(iso)
              return (
                <UnstyledButton
                  key={iso}
                  data-iso={iso}
                  className={classes.day}
                  data-selected={selected || undefined}
                  data-today={iso === today || undefined}
                  disabled={!allowed}
                  tabIndex={iso === focused ? 0 : -1}
                  onClick={() => pick(iso)}
                  onKeyDown={onDayKeyDown}
                  aria-pressed={selected}
                  aria-current={iso === today ? 'date' : undefined}
                  aria-label={`${formatBS(iso)} (${formatAD(iso)})`}
                >
                  {index + 1}
                </UnstyledButton>
              )
            })}
          </SimpleGrid>

          <Group justify="space-between" gap="sm">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => pick(today)}
              disabled={!isAllowed(today)}
            >
              Today
            </Button>
            {clearable && value && (
              <Button
                size="xs"
                variant="subtle"
                color="grey"
                onClick={() => {
                  onChange(null)
                  setOpened(false)
                }}
              >
                Clear
              </Button>
            )}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
