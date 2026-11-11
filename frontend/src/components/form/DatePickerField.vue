<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatDate } from '@/utils/format'

defineProps<{
  label?: string
  rules?: any[]
  clearable?: boolean
}>()

const modelValue = defineModel<string | null | undefined>()
const menu = ref(false)

const formattedDate = computed(() => {
  if (!modelValue.value) return ''
  return formatDate(modelValue.value)
})

function onDateChange(val: any) {
  if (val) {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      modelValue.value = d.toISOString().split('T')[0]
    }
  } else {
    modelValue.value = null
  }
  menu.value = false
}
</script>

<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    transition="scale-transition"
    offset-y
    min-width="auto"
  >
    <template v-slot:activator="{ props: menuProps }">
      <v-text-field
        v-bind="menuProps"
        :model-value="formattedDate"
        :label="label"
        :rules="rules"
        :clearable="clearable"
        readonly
        prepend-inner-icon="mdi-calendar"
        variant="outlined"
        density="comfortable"
        @click:clear="modelValue = null"
      />
    </template>
    <v-date-picker
      v-model="modelValue"
      @update:model-value="onDateChange"
      color="primary"
    />
  </v-menu>
</template>
