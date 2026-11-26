import { computed } from 'vue'
import { useTheme } from 'vuetify'

export function useThemeToggle() {
  const theme = useTheme()
  const isDark = computed(() => theme.global.name.value === 'achadexDark')

  const toggleTheme = () => {
    const newTheme = isDark.value ? 'achadexLight' : 'achadexDark'
    theme.global.name.value = newTheme
    if (typeof window !== 'undefined') {
      localStorage.setItem('achadex.theme', newTheme)
    }
  }

  return { isDark, toggleTheme }
}
