/**
 * The ONE place where CliniSar's look is defined: colours, font, spacing, radius and
 * the default settings of every Mantine component. Pages never hard-code colours.
 *
 * Colours: the 13 brand colours from the brief are the anchors. Mantine needs ten
 * light-to-dark steps per colour (for hover, focus and light backgrounds); each
 * scale below is built around its anchor, which sits at step 6 (the shade Mantine
 * uses for filled buttons and badges).
 */
import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core'

/** The brief's colours, by name. Only theme.ts and the charts read these directly. */
export const BRAND = {
  primary: '#3454D1',
  primaryDark: '#2A45B0',
  primaryLight: '#5B7CFA',
  primarySoft: '#E8EDFB',
  slate: '#8891C0',
  grey: '#9A9CA5',
  page: '#F5F6FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111827',
  textMuted: '#6B7280',
  success: '#16A34A',
  danger: '#D6246E',
} as const

/** Chart series colours, in the order the brief asks for. */
export const CHART_COLORS = [BRAND.primary, BRAND.primaryLight, BRAND.slate, BRAND.grey]

// step 0 = primary-soft, step 5 = primary-light, step 6 = primary, step 7 = primary-dark
const primary: MantineColorsTuple = [
  BRAND.primarySoft,
  '#D4DDF8',
  '#B4C3F5',
  '#91A6F7',
  '#738EF8',
  BRAND.primaryLight,
  BRAND.primary,
  BRAND.primaryDark,
  '#22398F',
  '#1A2C6E',
]
const success: MantineColorsTuple = [
  '#E8F6EE',
  '#CDEEDA',
  '#9FDDB7',
  '#6FCB92',
  '#45B972',
  '#2BAA5C',
  BRAND.success,
  '#12843C',
  '#0E6730',
  '#0A4A22',
]
const danger: MantineColorsTuple = [
  '#FBE8F0',
  '#F6CCDD',
  '#EE9FBE',
  '#E5709D',
  '#DD4882',
  '#D93274',
  BRAND.danger,
  '#B11C5A',
  '#8C1647',
  '#661034',
]
const slate: MantineColorsTuple = [
  '#F1F2F8',
  '#E2E4F0',
  '#C8CCE3',
  '#ADB3D5',
  '#99A1CB',
  '#8F97C5',
  BRAND.slate,
  '#6E77A6',
  '#565D84',
  '#3F4462',
]
const grey: MantineColorsTuple = [
  '#F3F3F4',
  '#E6E7E9',
  '#CFD0D4',
  '#B9BABF',
  '#A8AAB1',
  '#9FA1A9',
  BRAND.grey,
  '#7E808A',
  '#62646C',
  '#47484F',
]

export const theme = createTheme({
  // "lg" = 1024px: below this the sidebar becomes a drawer (as the brief asks).
  breakpoints: { xs: '36em', sm: '48em', md: '62em', lg: '64em', xl: '80em' },
  primaryColor: 'primary',
  primaryShade: 6,
  colors: { primary, success, danger, slate, grey },
  white: BRAND.surface,
  black: BRAND.text,
  fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  headings: {
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '28px', lineHeight: '1.3' },
      h2: { fontSize: '22px', lineHeight: '1.35' },
      h3: { fontSize: '18px', lineHeight: '1.4' },
      h4: { fontSize: '16px', lineHeight: '1.45' },
    },
  },
  // 8-point spacing grid: every gap and padding is 4, 8, 16, 24 or 32 px.
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  fontSizes: { xs: '12px', sm: '14px', md: '16px', lg: '18px', xl: '20px' },
  // Controls 8px, cards 12px (as in the reference dashboard).
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  defaultRadius: 'md',
  // Flat cards: a 1px border, no heavy shadow.
  shadows: {
    xs: '0 1px 2px rgba(17, 24, 39, 0.04)',
    sm: '0 1px 3px rgba(17, 24, 39, 0.06)',
    md: '0 4px 12px rgba(17, 24, 39, 0.08)',
    lg: '0 8px 24px rgba(17, 24, 39, 0.10)',
    xl: '0 12px 32px rgba(17, 24, 39, 0.12)',
  },
  cursorType: 'pointer',
  focusRing: 'auto',
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'lg', padding: 'lg', shadow: 'none' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'lg', centered: true, padding: 'lg' } },
    Badge: { defaultProps: { radius: 'sm', variant: 'light', size: 'md' } },
    Tooltip: { defaultProps: { withArrow: true } },
    Table: {
      defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md', highlightOnHover: true },
    },
    Notification: { defaultProps: { radius: 'md' } },
  },
})

/**
 * Point Mantine's text, muted text and border colours at the brand tokens, so built-in
 * components use exactly the brief's colours too.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    // Our own tokens for the few places Mantine has no setting (page background).
    '--clinisar-page': BRAND.page,
  },
  light: {
    '--mantine-color-body': BRAND.surface,
    '--mantine-color-text': BRAND.text,
    '--mantine-color-dimmed': BRAND.textMuted,
    '--mantine-color-default-border': BRAND.border,
    '--mantine-color-placeholder': BRAND.grey,
  },
  dark: {},
})
