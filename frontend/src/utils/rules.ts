export const rules = {
  required: (v: any) => !!v || 'Campo obrigatório.',
  email: (v: string) => /.+@.+\..+/.test(v) || 'E-mail inválido.',
  minLen: (min: number) => (v: string) => (!v || v.length >= min) || `Mínimo de ${min} caracteres.`,
}
