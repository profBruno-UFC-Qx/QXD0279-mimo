export function formatDate(iso?: string | null): string {
  if (!iso) return '-'
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (dateOnlyMatch) {
    const [, yearStr, monthStr, dayStr] = dateOnlyMatch
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    const utcDate = new Date(Date.UTC(year, month - 1, day))
    if (
      utcDate.getUTCFullYear() === year &&
      utcDate.getUTCMonth() + 1 === month &&
      utcDate.getUTCDate() === day
    ) {
      return `${dayStr}/${monthStr}/${yearStr}`
    }
    return iso
  }
  try {
    const date = new Date(iso)
    if (isNaN(date.getTime())) return iso
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  } catch {
    return iso ?? '-'
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-'
  try {
    const date = new Date(iso)
    if (isNaN(date.getTime())) return iso
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return iso ?? '-'
  }
}

export function formatCpf(v?: string | null): string {
  if (!v) return ''
  const digits = v.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

export function maskCpf(v?: string | null): string {
  return formatCpf(v)
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
