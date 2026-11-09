export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-'
  try {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('pt-BR').format(date)
  } catch {
    return dateString
  }
}

export function formatCpf(cpf?: string | null): string {
  if (!cpf) return ''
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return cpf
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}
