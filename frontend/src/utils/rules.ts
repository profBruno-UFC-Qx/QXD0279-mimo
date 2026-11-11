export function validateCpfDigits(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned.charAt(i), 10) * (10 - i)
  }
  let rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(cleaned.charAt(9), 10)) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned.charAt(i), 10) * (11 - i)
  }
  rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(cleaned.charAt(10), 10)) return false

  return true
}

export const required = (v: unknown): true | string => {
  if (v === null || v === undefined) return 'Campo obrigatório.'
  if (typeof v === 'string' && v.trim() === '') return 'Campo obrigatório.'
  if (Array.isArray(v) && v.length === 0) return 'Campo obrigatório.'
  return true
}

export const email = (v: string): true | string => {
  if (!v) return true
  return /.+@.+\..+/.test(v) || 'E-mail inválido.'
}

export const minLen = (min: number) => (v: string): true | string => {
  if (!v) return true
  return v.length >= min || `Mínimo de ${min} caracteres.`
}

export const cpf = (v: string): true | string => {
  if (!v) return true
  return validateCpfDigits(v) || 'CPF inválido.'
}

// Mantém também o objeto agrupado
export const rules = { required, email, minLen, cpf }
