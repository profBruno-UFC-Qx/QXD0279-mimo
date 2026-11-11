<script setup lang="ts">
import { computed } from 'vue'
import { maskCpf } from '@/utils/format'
import { cpf as cpfRule, required } from '@/utils/rules'

const props = withDefaults(
  defineProps<{
    label?: string
    required?: boolean
    emitDigits?: boolean
  }>(),
  {
    label: 'CPF',
    required: false,
    emitDigits: true,
  }
)

const modelValue = defineModel<string | null | undefined>()

const displayValue = computed({
  get: () => maskCpf(modelValue.value || ''),
  set: (val: string | null) => {
    if (!val) {
      modelValue.value = ''
      return
    }
    const digits = val.replace(/\D/g, '')
    modelValue.value = props.emitDigits ? digits : maskCpf(digits)
  },
})

const rules = computed(() => {
  const r = []
  if (props.required) r.push(required)
  r.push(cpfRule)
  return r
})
</script>

<template>
  <v-text-field
    v-model="displayValue"
    :label="label"
    :rules="rules"
    placeholder="___.___.___-__"
    maxlength="14"
    prepend-inner-icon="mdi-card-account-details-outline"
    variant="outlined"
    density="comfortable"
  />
</template>
