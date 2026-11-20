<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DispositionType, Item } from '@/types'
import { dispositionService } from '@/services/disposition.service'
import { adminItemService } from '@/services/adminItem.service'
import { useUiStore } from '@/stores/uiStore'
import { extractLostReportErrorMessage, getErrorStatus } from '@/utils/lostReport'
import {
  DISPOSITION_LABELS,
  DISPOSITION_OPTIONS,
  isValidReceiverDocument,
} from '@/utils/dispositions'
import { required, type ValidationRule } from '@/utils/rules'
import StatusChip from '@/components/common/StatusChip.vue'

const props = defineProps<{ item: Item | null }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
  created: []
  conflict: []
}>()

const ui = useUiStore()
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const destination = ref<DispositionType | null>(null)
const receiverDocument = ref('')
const destinationError = ref<string | null>(null)
const submitError = ref<string | null>(null)
const submitting = ref(false)
const conflictState = ref(false)

const canDispose = computed(
  () => props.item !== null && props.item.status === 'ELIGIBLE' && !conflictState.value,
)
const plannedLabel = computed(() => {
  const planned = props.item?.plannedDestination
  return planned ? DISPOSITION_LABELS[planned] : 'Não definido'
})
const selectedLabel = computed(() =>
  destination.value ? DISPOSITION_LABELS[destination.value] : 'Não selecionado',
)
const destinationDiffers = computed(
  () =>
    destination.value !== null &&
    props.item?.plannedDestination !== null &&
    props.item?.plannedDestination !== undefined &&
    destination.value !== props.item.plannedDestination,
)

const documentRules: ValidationRule[] = [
  required,
  (value) =>
    (typeof value === 'string' && isValidReceiverDocument(value)) ||
    'Informe um CPF ou CNPJ válido.',
]

function resetForm() {
  destination.value = props.item?.plannedDestination ?? null
  receiverDocument.value = ''
  destinationError.value = null
  submitError.value = null
  conflictState.value = false
  submitting.value = false
}

function close() {
  if (submitting.value) return
  resetForm()
  open.value = false
}

async function verifyUncertainState(itemId: number) {
  try {
    const details = await adminItemService.getById(itemId)
    if (details.item.status !== 'ELIGIBLE') {
      submitError.value =
        'Não foi possível confirmar a destinação. O item não está mais elegível; verifique o histórico atualizado antes de tentar novamente.'
      conflictState.value = true
      emit('conflict')
      return
    }
    submitError.value =
      'Não foi possível confirmar a destinação. O item continua elegível; atualize a lista antes de tentar novamente.'
    conflictState.value = true
    emit('conflict')
  } catch {
    submitError.value =
      'Não foi possível confirmar o resultado da destinação. Atualize a lista antes de tentar novamente.'
    conflictState.value = true
    emit('conflict')
  }
}

async function submit() {
  if (submitting.value || !open.value || !props.item || !canDispose.value) return

  submitting.value = true
  submitError.value = null
  destinationError.value = null

  try {
    const validation = await formRef.value?.validate()
    if (!validation?.valid) return

    if (destination.value === null) {
      destinationError.value = 'Selecione o destino da destinação.'
      return
    }

    const item = props.item
    const document = receiverDocument.value.trim()
    if (!isValidReceiverDocument(document)) {
      submitError.value = 'Informe um CPF ou CNPJ válido.'
      return
    }

    const confirmed = await ui.confirm({
      title: 'Executar destinação?',
      message: `O item "${item.title}" será destinado como ${DISPOSITION_LABELS[destination.value]} para ${document}. O status do item será alterado e a operação não poderá ser desfeita por esta interface.`,
      confirmText: 'Executar destinação',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    await dispositionService.create({
      itemId: item.id,
      destination: destination.value,
      receiverDocument: document,
    })

    ui.notifySuccess('Destinação registrada com sucesso.')
    resetForm()
    open.value = false
    emit('created')
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 409) {
      submitError.value =
        'Este item já não está elegível para destinação. O estado será atualizado.'
      conflictState.value = true
      emit('conflict')
      return
    }
    if (httpStatus === 403) {
      submitError.value =
        'Sua sessão não possui permissão administrativa para executar destinações.'
      return
    }
    if (httpStatus === 404) {
      submitError.value =
        'O item não foi encontrado. Atualize a lista antes de tentar novamente.'
      conflictState.value = true
      emit('conflict')
      return
    }
    if (httpStatus === 400) {
      submitError.value = extractLostReportErrorMessage(
        err,
        'Dados inválidos para executar a destinação.',
      )
      return
    }
    await verifyUncertainState(props.item.id)
  } finally {
    submitting.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) resetForm()
})

watch(
  () => props.item?.id,
  () => {
    if (open.value) resetForm()
  },
)
</script>

<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card class="rounded-lg pa-2">
      <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
        Executar destinação
      </v-card-title>

      <v-card-text class="px-4 py-3">
        <v-alert v-if="!item" type="warning" variant="tonal" class="rounded-lg">
          Nenhum item selecionado para destinação.
        </v-alert>

        <template v-else>
          <v-card variant="tonal" class="px-4 py-3 mb-4 rounded-lg">
            <div class="d-flex align-center justify-space-between flex-wrap ga-2">
              <div>
                <div class="text-subtitle-1 font-weight-bold">
                  {{ item.title }}
                </div>
                <div class="text-body-2 text-medium-emphasis">Item #{{ item.id }}</div>
              </div>
              <StatusChip :status="item.status" />
            </div>
            <div class="text-body-2 text-medium-emphasis mt-2">
              Destino planejado: <strong>{{ plannedLabel }}</strong>
            </div>
          </v-card>

          <v-alert
            v-if="!canDispose && !conflictState"
            type="warning"
            variant="tonal"
            class="mb-4 rounded-lg"
          >
            Este item não está elegível para destinação.
          </v-alert>

          <v-form ref="formRef" @submit.prevent="submit">
            <v-select
              v-model="destination"
              :items="DISPOSITION_OPTIONS"
              item-title="title"
              item-value="value"
              label="Destino da destinação *"
              variant="outlined"
              density="comfortable"
              :error-messages="destinationError ? [destinationError] : []"
              :disabled="submitting || !canDispose"
              class="mb-2"
            />

            <v-alert
              v-if="destinationDiffers"
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3 rounded-lg"
            >
              O destino selecionado ({{ selectedLabel }}) difere do planejado
              ({{ plannedLabel }}).
            </v-alert>

            <v-text-field
              v-model="receiverDocument"
              label="CPF ou CNPJ do destinatário *"
              variant="outlined"
              density="comfortable"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              :rules="documentRules"
              :disabled="submitting || !canDispose"
            />

            <v-alert v-if="submitError" type="error" variant="tonal" class="mt-4 rounded-lg">
              {{ submitError }}
            </v-alert>
          </v-form>
        </template>
      </v-card-text>

      <v-card-actions class="px-4 pb-4 pt-2">
        <v-spacer />
        <v-btn variant="text" class="text-none" :disabled="submitting" @click="close">
          Cancelar
        </v-btn>
        <v-btn
          v-if="canDispose"
          color="primary"
          class="text-none"
          :loading="submitting"
          @click="submit"
        >
          Executar destinação
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
