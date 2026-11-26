export const palette = {
  primary: '#173B57',
  onPrimary: '#FFFFFF',
  onSurface: '#263746',
  secondary: '#28766E',
  accent: '#C58A2A',
  success: '#347A52',
  warning: '#A96812',
  error: '#B54747',
  info: '#3A718F',
  background: '#F3F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#E8EEF2',
  outline: '#BCC9D2',
}

export const darkPalette = {
  primary: '#5299D3',
  onPrimary: '#FFFFFF',
  onSurface: '#E8EEF2',
  secondary: '#3E9B91',
  accent: '#E5A93B',
  success: '#43A047',
  warning: '#FB8C00',
  error: '#E57373',
  info: '#42A5F5',
  background: '#121820',
  surface: '#1E2530',
  surfaceMuted: '#27303F',
  outline: '#3F4C5E',
}

export type StatusColorToken = keyof typeof palette | string

