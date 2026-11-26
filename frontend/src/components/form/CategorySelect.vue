<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
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
const categoriesStore = useCategoriesStore()
const rules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label ?? 'Categoria'}${props.required ? ' *' : ''}`)
let releaseConsumer: (() => void) | null = null

function retryLoad() {
  if (categoriesStore.loading || !categoriesStore.error) return
  void categoriesStore.ensureLoaded(true)
}

onMounted(() => {
  releaseConsumer = categoriesStore.acquireConsumer()
  categoriesStore.ensureLoaded()
})

onBeforeUnmount(() => {
  releaseConsumer?.()
  releaseConsumer = null
})
</script>

<template>
  <div class="category-select">
    <v-select
      v-bind="$attrs"
      v-model="modelValue"
      :items="categoriesStore.items"
      item-title="name"
      item-value="id"
      :label="fieldLabel"
      :rules="rules"
      :clearable="clearable ?? true"
      :placeholder="placeholder ?? 'Selecione a categoria'"
      :no-data-text="categoriesStore.error ? 'Não foi possível carregar as categorias.' : 'Nenhuma categoria disponível.'"
      :loading="categoriesStore.loading"
      variant="outlined"
      density="comfortable"
    />
    <v-alert
      v-if="props.showLoadError && categoriesStore.error && !categoriesStore.loading"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-2 rounded-lg"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2">
        <span class="text-caption">Não foi possível carregar as categorias.</span>
        <v-btn
          size="small"
          variant="text"
          color="error"
          class="text-none px-2"
          :disabled="categoriesStore.loading"
          @click="retryLoad"
        >
          Tentar novamente
        </v-btn>
      </div>
    </v-alert>
  </div>
</template>
