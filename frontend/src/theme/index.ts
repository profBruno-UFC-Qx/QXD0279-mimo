import { createVuetify, type ThemeDefinition } from 'vuetify'
import { palette, darkPalette } from './colors'
import { typography } from './typography'
import { shapes } from './shapes'

const achadexLight: ThemeDefinition = {
  dark: false,
  colors: {
    'primary': palette.primary,
    'on-primary': palette.onPrimary,
    'on-surface': palette.onSurface,
    'secondary': palette.secondary,
    'accent': palette.accent,
    'success': palette.success,
    'warning': palette.warning,
    'error': palette.error,
    'info': palette.info,
    'background': palette.background,
    'surface': palette.surface,
    'surface-muted': palette.surfaceMuted,
    'outline': palette.outline,
  },
  variables: {
    'font-body': typography.fontFamily,
  },
}

const achadexDark: ThemeDefinition = {
  dark: true,
  colors: {
    'primary': darkPalette.primary,
    'on-primary': darkPalette.onPrimary,
    'on-surface': darkPalette.onSurface,
    'secondary': darkPalette.secondary,
    'accent': darkPalette.accent,
    'success': darkPalette.success,
    'warning': darkPalette.warning,
    'error': darkPalette.error,
    'info': darkPalette.info,
    'background': darkPalette.background,
    'surface': darkPalette.surface,
    'surface-muted': darkPalette.surfaceMuted,
    'outline': darkPalette.outline,
  },
  variables: {
    'font-body': typography.fontFamily,
  },
}

const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('achadex.theme') : null
const defaultTheme = savedTheme || 'achadexLight'

export const vuetify = createVuetify({
  theme: { defaultTheme, themes: { achadexLight, achadexDark } },
  defaults: {
    VBtn: { rounded: shapes.borderRadius, elevation: 0 },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
    VCard: { rounded: shapes.borderRadius, elevation: 1 },
    VAlert: { rounded: shapes.borderRadius },
  },
})
