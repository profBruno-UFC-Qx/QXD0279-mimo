<script setup lang="ts">
import AdminDialog from '@/components/common/AdminDialog.vue'
import { computed, ref, watch } from 'vue'
import type { Handover, Item } from '@/types'
import { handoverService } from '@/services/handover.service'
import { useUiStore } from '@/stores/uiStore'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { isItemDeliverable } from '@/utils/adminItems'
import { required, type ValidationRule } from '@/utils/rules'
import CpfField from '@/components/form/CpfField.vue'
import StatusChip from '@/components/common/StatusChip.vue'

const props = defineProps<{ item: Item | null }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
  created: [handover: Handover]
  conflict: []
}>()

const ui = useUiStore()
const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const withdrawnName = ref('')
const withdrawnCpf = ref('')
const withdrawnUserIdInput = ref('')
const userIdError = ref<string | null>(null)
const submitError = ref<string | null>(null)
const submitting = ref(false)

const nameRules: ValidationRule[] = [
  required,
  (value) => {
    const length = typeof value === 'string' ? value.trim().length : 0
    return (length >= 3 && length <= 150) || 'O nome deve ter entre 3 e 150 caracteres.'
  },
]

const canDeliver = computed(() => props.item !== null && isItemDeliverable(props.item.status))

function resetForm() {
  withdrawnName.value = ''
  withdrawnCpf.value = ''
  withdrawnUserIdInput.value = ''
  userIdError.value = null
  submitError.value = null
  submitting.value = false
}

function close() {
  if (submitting.value) return
  resetForm()
  open.value = false
}

async function submit() {
  if (submitting.value || !open.value || !props.item || !canDeliver.value) return

  submitting.value = true
  submitError.value = null
  userIdError.value = null

  try {
    const validation = await formRef.value?.validate()
    if (!validation?.valid) return

    const item = props.item
    const name = withdrawnName.value.trim()
    const cpf = withdrawnCpf.value.replace(/\D/g, '')
    if (name.length < 3 || name.length > 150) {
      submitError.value = 'Informe o nome completo do retirante.'
      return
    }
    if (cpf.length !== 11) {
      submitError.value = 'Informe um CPF válido.'
      return
    }

    const userIdText = withdrawnUserIdInput.value.trim()
    let withdrawnUserId: number | null = null
    if (userIdText !== '') {
      if (!/^[1-9]\d*$/.test(userIdText)) {
        userIdError.value = 'Informe um ID de conta inteiro positivo ou deixe vazio.'
        return
      }
      const parsed = Number(userIdText)
      if (!isPositiveSafeId(parsed)) {
        userIdError.value = 'Informe um ID de conta inteiro positivo ou deixe vazio.'
        return
      }
      withdrawnUserId = parsed
    }

    const confirmed = await ui.confirm({
      title: 'Registrar entrega?',
      message: `A retirada de "${item.title}" por ${name} será registrada. O item passará para "Entregue" e não poderá mais ser editado ou excluído.`,
      confirmText: 'Registrar entrega',
      cancelText: 'Cancelar',
    })
    if (!confirmed) return

    const created = await handoverService.create({
      itemId: item.id,
      withdrawnName: name,
      withdrawnCpf: cpf,
      withdrawnUserId,
    })

    ui.notifySuccess('Entrega registrada com sucesso.')
    emit('created', created)
    resetForm()
    open.value = false
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 409) {
      submitError.value =
        'Este item já foi entregue ou não está mais disponível. O estado do item será atualizado.'
      emit('conflict')
      return
    }
    if (httpStatus === 403) {
      submitError.value = 'Sua sessão não possui permissão administrativa para registrar entregas.'
      return
    }
    if (httpStatus === 404) {
      submitError.value = extractLostReportErrorMessage(
        err,
        'Item ou usuário retirante não encontrado.',
      )
      return
    }
    if (httpStatus === 400) {
      submitError.value = extractLostReportErrorMessage(
        err,
        'Dados inválidos para registrar a entrega.',
      )
      return
    }
    submitError.value = extractLostReportErrorMessage(
      err,
      'Não foi possível registrar a entrega. Tente novamente.',
    )
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
  <AdminDialog v-model="open" max-width="560" persistent>
    <template #title>
      Registrar entrega
    </template>

    <v-alert v-if="!item" type="warning" variant="tonal" class="rounded-lg">
      Nenhum item selecionado para entrega.
    </v-alert>

    <template v-else>
      <v-card variant="tonal" class="px-4 py-3 mb-4 rounded-lg">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <div>
            <div class="text-subtitle-1 font-weight-bold">{{ item.title }}</div>
            <div class="text-body-2 text-medium-emphasis">Item #{{ item.id }}</div>
          </div>
          <StatusChip :status="item.status" />
        </div>
      </v-card>

      <v-alert
        v-if="!canDeliver"
        type="warning"
        variant="tonal"
        class="mb-4 rounded-lg"
      >
        Este item não está disponível para entrega.
      </v-alert>

      <v-form ref="formRef" @submit.prevent="submit">
        <v-text-field
          v-model="withdrawnName"
          label="Nome completo do retirante *"
          variant="outlined"
          density="comfortable"
          :rules="nameRules"
          :disabled="submitting || !canDeliver"
          class="mb-2"
        />

        <CpfField
          v-model="withdrawnCpf"
          label="CPF do retirante"
          required
          :disabled="submitting || !canDeliver"
        />

        <v-text-field
          v-model="withdrawnUserIdInput"
          label="ID da conta do usuário (opcional)"
          variant="outlined"
          density="comfortable"
          inputmode="numeric"
          :error-messages="userIdError ?? []"
          :disabled="submitting || !canDeliver"
          class="mt-2"
        />
        <p class="text-caption text-medium-emphasis">
          Associe uma conta para que a retirada apareça no histórico do usuário.
        </p>

        <v-alert v-if="submitError" type="error" variant="tonal" class="mt-4 rounded-lg">
          {{ submitError }}
        </v-alert>
      </v-form>
    </template>

    <template #actions>
      <v-spacer />
      <v-btn variant="text" class="text-none" :disabled="submitting" @click="close">
        Cancelar
      </v-btn>
      <v-btn
        v-if="canDeliver"
        color="primary"
        class="text-none"
        :loading="submitting"
        :disabled="!item"
        @click="submit"
      >
        Registrar entrega
      </v-btn>
    </template>
  </AdminDialog>
</template>
