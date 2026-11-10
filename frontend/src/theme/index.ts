import { createVuetify, type ThemeDefinition } from 'vuetify'
import { palette } from './colors'
import { typography } from './typography'
import { shapes } from './shapes'

const achadexLight: ThemeDefinition = {
  dark: false,
  colors: {
    'primary': palette.primary,
    'on-primary': palette.onPrimary,
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

export const vuetify = createVuetify({
  theme: { defaultTheme: 'achadexLight', themes: { achadexLight } },
  defaults: {
    VBtn: { rounded: shapes.borderRadius, elevation: 0 },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
    VCard: { rounded: shapes.borderRadius, elevation: 1 },
    VAlert: { rounded: shapes.borderRadius },
  },
})
