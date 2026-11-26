<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  label?: string
  rules?: ValidationRule[]
  required?: boolean
  clearable?: boolean
  placeholder?: string
  showLoadError?: boolean
}>(), {
  required: false,
  showLoadError: true,
})

const modelValue = defineModel<number | null | undefined>()
const buildingsStore = useBuildingsStore()
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Prédio'}${props.required ? ' *' : ''}`)
let releaseConsumer: (() => void) | null = null

function retryLoad() {
  if (buildingsStore.loading || !buildingsStore.error) return
  void buildingsStore.ensureLoaded(true)
}

onMounted(() => {
  releaseConsumer = buildingsStore.acquireConsumer()
  buildingsStore.ensureLoaded()
})

onBeforeUnmount(() => {
  releaseConsumer?.()
  releaseConsumer = null
})
</script>

<template>
  <div class="building-select">
    <v-select
      v-bind="$attrs"
      v-model="modelValue"
      :items="buildingsStore.items"
      item-title="name"
      item-value="id"
      :label="fieldLabel"
      :rules="rules"
      :clearable="clearable ?? true"
      :placeholder="placeholder ?? 'Selecione o prédio'"
      :no-data-text="buildingsStore.error ? 'Não foi possível carregar os prédios.' : 'Nenhum prédio disponível.'"
      :loading="buildingsStore.loading"
      variant="outlined"
      density="comfortable"
    />
    <v-alert
      v-if="props.showLoadError && buildingsStore.error && !buildingsStore.loading"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-2 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span class="text-caption">Não foi possível carregar os prédios.</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none px-2"
          :disabled="buildingsStore.loading"
          @click="retryLoad"
        >
          Tentar novamente
        </v-btn>
      </div>
    </v-alert>
  </div>
</template>
