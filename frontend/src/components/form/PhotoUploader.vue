<script setup lang="ts">
import AppPill from '@/components/common/AppPill.vue'
import { ref, watch, onUnmounted } from 'vue'
import { computed } from 'vue'
import { required as requiredRule, type ValidationRule } from '@/utils/rules'

const props = withDefaults(
  defineProps<{
    max?: number
    label?: string
    required?: boolean
    rules?: ValidationRule[]
  }>(),
  {
    max: 5,
    label: 'Fotos do item',
    required: false,
  }
)

const photos = defineModel<File[]>('photos', { default: () => [] })
const fileInput = ref<File[] | null>(null)
const previews = ref<string[]>([])
const fieldRules = computed(() => [...(props.rules ?? []), ...(props.required ? [requiredRule] : [])])
const fieldLabel = computed(() => `${props.label}${props.required ? ' *' : ''} (máx. ${props.max})`)

function updatePreviews() {
  previews.value.forEach((url) => URL.revokeObjectURL(url))
  previews.value = photos.value.map((file) => URL.createObjectURL(file))
}

function onFilesSelected(files: File | File[] | null) {
  if (!files) return
  const fileArray = Array.isArray(files) ? files : [files]
  const remainingSlots = props.max - photos.value.length
  const newFiles = fileArray.slice(0, remainingSlots)

  photos.value = [...photos.value, ...newFiles]
  fileInput.value = null
  updatePreviews()
}

function removePhoto(index: number) {
  URL.revokeObjectURL(previews.value[index])
  photos.value = photos.value.filter((_, i) => i !== index)
  updatePreviews()
}

watch(photos, () => {
  updatePreviews()
}, { immediate: true })

onUnmounted(() => {
  previews.value.forEach((url) => URL.revokeObjectURL(url))
})
</script>

<template>
  <div>
    <v-file-input
      v-model="fileInput"
      accept="image/*"
      multiple
      :label="fieldLabel"
      :rules="fieldRules"
      prepend-icon="mdi-camera-outline"
      variant="outlined"
      density="comfortable"
      @update:model-value="onFilesSelected"
      :disabled="photos.length >= max"
    />
    <div class="text-caption text-medium-emphasis mb-3">
      A primeira foto é a capa do item.
    </div>

    <div v-if="previews.length > 0" class="d-flex flex-wrap gap-3">
      <div
        v-for="(url, index) in previews"
        :key="index"
        class="position-relative rounded-lg overflow-hidden border"
        style="width: 90px; height: 90px;"
      >
        <v-img :src="url" cover width="100%" height="100%" />
        <v-btn
          icon="mdi-close"
          size="x-small"
          color="error"
          variant="flat"
          class="position-absolute top-0 right-0 ma-1"
          @click="removePhoto(index)"
        />
        <AppPill
          v-if="index === 0"
          color="primary"
          class="position-absolute bottom-0 left-0 ma-1"
        >
          Capa
        </AppPill>
      </div>
    </div>
  </div>
</template>
