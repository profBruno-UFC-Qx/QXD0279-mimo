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
  primary: '#C4CDD6',
  onPrimary: '#17191C',
  onSurface: '#E8EEF2',
  secondary: '#929BA4',
  accent: '#E5A93B',
  success: '#43A047',
  warning: '#FB8C00',
  error: '#E57373',
  info: '#9AA8B5',
  background: '#101214',
  surface: '#191C20',
  surfaceMuted: '#25292E',
  outline: '#4A5058',
}

export type StatusColorToken = keyof typeof palette | string

