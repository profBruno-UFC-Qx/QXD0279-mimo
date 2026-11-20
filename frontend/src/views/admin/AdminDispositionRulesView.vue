<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type {
  CreateDispositionRulePayload,
  DispositionRule,
  DispositionType,
  UpdateDispositionRulePayload,
} from '@/types'
import { dispositionRuleService } from '@/services/dispositionRule.service'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatDateTime } from '@/utils/format'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { DISPOSITION_LABELS, DISPOSITION_OPTIONS } from '@/utils/dispositions'

type ActiveFilter = 'all' | 'active' | 'inactive'

const auth = useAuthStore()
const ui = useUiStore()

const rules = ref<DispositionRule[]>([])
const loading = ref(false)
const listError = ref<string | null>(null)
const activeFilter = ref<ActiveFilter>('all')

const editorOpen = ref(false)
const editorMode = ref<'create' | 'edit'>('create')
const editingRuleId = ref<number | null>(null)
const editingOriginal = ref<DispositionRule | null>(null)
const daysInput = ref('')
const destination = ref<DispositionType | null>(null)
const activeValue = ref(true)
const lockedValue = ref(false)
const daysError = ref<string | null>(null)
const destinationError = ref<string | null>(null)
const formError = ref<string | null>(null)
const submitting = ref(false)
const deletingRuleId = ref<number | null>(null)

let latestListRequestId = 0

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)
const isSuperAdmin = computed(() => auth.isSuperAdmin)

function canModifyRule(rule: DispositionRule): boolean {
  return hasAdminAccess.value && (isSuperAdmin.value || !rule.locked)
}

function parseDays(value: string): number | null {
  const text = value.trim()
  if (!/^[1-9]\d*$/.test(text)) return null
  const days = Number(text)
  return Number.isSafeInteger(days) ? days : null
}

async function loadRules() {
  if (!hasAdminAccess.value) return

  const requestId = ++latestListRequestId
  loading.value = true
  listError.value = null

  try {
    const query =
      activeFilter.value === 'all' ? undefined : { active: activeFilter.value === 'active' }
    const result = await dispositionRuleService.list(query)
    if (requestId !== latestListRequestId) return
    rules.value = result
  } catch (err: unknown) {
    if (requestId !== latestListRequestId) return
    rules.value = []
    const httpStatus = getErrorStatus(err)
    listError.value =
      httpStatus === 403
        ? 'Sua sessão não possui permissão administrativa para consultar regras de destinação.'
        : extractLostReportErrorMessage(
            err,
            'Não foi possível carregar as regras de destinação. Tente novamente.',
          )
  } finally {
    if (requestId === latestListRequestId) {
      loading.value = false
    }
  }
}

function resetEditorFields() {
  daysInput.value = ''
  destination.value = null
  activeValue.value = true
  lockedValue.value = false
  daysError.value = null
  destinationError.value = null
  formError.value = null
}

function dismissEditor() {
  editorOpen.value = false
  editorMode.value = 'create'
  editingRuleId.value = null
  editingOriginal.value = null
  resetEditorFields()
}

function closeEditor() {
  if (submitting.value) return
  dismissEditor()
}

function openCreate() {
  if (!hasAdminAccess.value || submitting.value || deletingRuleId.value !== null) return
  dismissEditor()
  editorMode.value = 'create'
  editorOpen.value = true
}

function openEdit(rule: DispositionRule) {
  if (
    !canModifyRule(rule) ||
    submitting.value ||
    deletingRuleId.value !== null ||
    !isPositiveSafeId(rule.id)
  ) {
    return
  }
  dismissEditor()
  editorMode.value = 'edit'
  editingRuleId.value = rule.id
  editingOriginal.value = rule
  daysInput.value = String(rule.days)
  destination.value = rule.destination
  activeValue.value = rule.active
  lockedValue.value = rule.locked
  editorOpen.value = true
}

async function refreshAfterConflict(ruleId: number) {
  try {
    const fresh = await dispositionRuleService.getById(ruleId)
    if (editorOpen.value && editingRuleId.value === ruleId) {
      if (!canModifyRule(fresh)) {
        dismissEditor()
        ui.notifyError('Esta regra foi travada por outro administrador e não pode ser alterada.')
        return
      }
      editingOriginal.value = fresh
      daysInput.value = String(fresh.days)
      destination.value = fresh.destination
      activeValue.value = fresh.active
      lockedValue.value = fresh.locked
    }
  } catch {
    if (editorOpen.value && editingRuleId.value === ruleId) {
      dismissEditor()
    }
  }
}

async function submitRule() {
  if (submitting.value || !editorOpen.value || !hasAdminAccess.value) return

  formError.value = null
  daysError.value = null
  destinationError.value = null
  const days = parseDays(daysInput.value)
  if (days === null) {
    daysError.value = 'Informe um prazo inteiro positivo.'
    return
  }
  if (destination.value === null) {
    destinationError.value = 'Selecione o destino da destinação.'
    return
  }

  submitting.value = true
  const targetId = editingRuleId.value
  const original = editingOriginal.value

  try {
    if (editorMode.value === 'create') {
      const payload: CreateDispositionRulePayload = {
        days,
        destination: destination.value,
      }
      await dispositionRuleService.create(payload)
      ui.notifySuccess('Regra de destinação cadastrada com sucesso.')
      dismissEditor()
      await loadRules()
      return
    }

    if (!isPositiveSafeId(targetId) || original === null) return

    const payload: UpdateDispositionRulePayload = {}
    if (days !== original.days) payload.days = days
    if (destination.value !== original.destination) payload.destination = destination.value
    if (activeValue.value !== original.active) payload.active = activeValue.value
    if (isSuperAdmin.value && lockedValue.value !== original.locked) {
      payload.locked = lockedValue.value
    }

    if (Object.keys(payload).length === 0) {
      dismissEditor()
      return
    }

    await dispositionRuleService.update(targetId, payload)
    ui.notifySuccess('Regra de destinação atualizada com sucesso.')
    dismissEditor()
    await loadRules()
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 403) {
      formError.value =
        'Sua sessão não pode alterar esta regra. Ela pode estar travada; apenas SUPERADMIN pode modificá-la.'
      if (isPositiveSafeId(targetId)) {
        await refreshAfterConflict(targetId)
        await loadRules()
      }
      return
    }
    if (httpStatus === 404) {
      ui.notifyError('Esta regra não existe mais no servidor.')
      await loadRules()
      dismissEditor()
      return
    }
    if (httpStatus === 409) {
      formError.value =
        'A regra foi alterada por outra sessão. Os dados atuais foram carregados; revise antes de tentar novamente.'
      if (isPositiveSafeId(targetId)) {
        await refreshAfterConflict(targetId)
        await loadRules()
      }
      return
    }
    if (httpStatus === 400) {
      formError.value = extractLostReportErrorMessage(
        err,
        'Dados inválidos para salvar a regra de destinação.',
      )
      return
    }
    formError.value = extractLostReportErrorMessage(
      err,
      'Não foi possível salvar a regra de destinação. Tente novamente.',
    )
  } finally {
    submitting.value = false
  }
}

async function requestDeleteRule(rule: DispositionRule) {
  if (
    !canModifyRule(rule) ||
    deletingRuleId.value !== null ||
    submitting.value ||
    ui.confirmDialog.show ||
    ui.confirmDialog.open ||
    !isPositiveSafeId(rule.id)
  ) {
    return
  }

  const confirmed = await ui.confirm({
    title: 'Excluir regra?',
    message: `Deseja excluir a regra #${rule.id} (${rule.days} dias, ${DISPOSITION_LABELS[rule.destination]})? Esta ação não pode ser desfeita.`,
    danger: true,
    confirmText: 'Excluir regra',
    cancelText: 'Cancelar',
  })
  if (!confirmed) return

  deletingRuleId.value = rule.id
  try {
    await dispositionRuleService.remove(rule.id)
    ui.notifySuccess('Regra de destinação excluída com sucesso.')
    await loadRules()
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 403) {
      ui.notifyError(
        'Sua sessão não pode excluir esta regra. Ela pode estar travada; apenas SUPERADMIN pode excluí-la.',
      )
    } else if (httpStatus === 404) {
      ui.notifyError('Esta regra já foi removida anteriormente.')
    } else if (httpStatus === 409) {
      ui.notifyError('A regra foi alterada por outra sessão. A listagem será atualizada.')
    } else {
      ui.notifyError(
        extractLostReportErrorMessage(err, 'Não foi possível excluir a regra de destinação.'),
      )
    }
    if (httpStatus === 403 || httpStatus === 404 || httpStatus === 409) {
      await loadRules()
    }
  } finally {
    deletingRuleId.value = null
  }
}

watch(activeFilter, () => {
  if (hasAdminAccess.value) void loadRules()
})

onMounted(() => {
  if (!hasAdminAccess.value) return
  void loadRules()
})
</script>

<template>
  <div>
    <PageHeader
      title="Regras de Destinação"
      subtitle="Configure os prazos e destinos usados no processamento de elegibilidade."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-refresh"
            :disabled="!hasAdminAccess"
            :loading="loading"
            @click="loadRules()"
          >
            Atualizar
          </v-btn>
          <v-btn
            color="primary"
            class="text-none"
            prepend-icon="mdi-plus"
            :disabled="!hasAdminAccess || submitting || deletingRuleId !== null"
            @click="openCreate"
          >
            Nova regra
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-3">
      <v-btn-toggle
        v-model="activeFilter"
        mandatory
        color="primary"
        variant="outlined"
        density="comfortable"
        divided
        class="flex-wrap"
      >
        <v-btn value="all" class="text-none">Todas</v-btn>
        <v-btn value="active" class="text-none">Ativas</v-btn>
        <v-btn value="inactive" class="text-none">Inativas</v-btn>
      </v-btn-toggle>
      <v-chip size="small" variant="tonal" color="primary">
        {{ rules.length }} {{ rules.length === 1 ? 'regra' : 'regras' }}
      </v-chip>
    </div>

    <p v-if="hasAdminAccess && !isSuperAdmin" class="text-caption text-medium-emphasis mb-4">
      Regras travadas são somente leitura para ADMIN. Apenas SUPERADMIN pode travá-las,
      destravá-las ou excluí-las.
    </p>

    <ErrorAlert v-if="listError" :error="listError" @retry="loadRules()" />

    <LoadingOverlay :loading="loading" text="Carregando regras de destinação...">
      <template v-if="!listError">
        <v-card v-if="rules.length > 0" variant="flat" class="rounded-lg border overflow-hidden">
          <div class="overflow-x-auto">
            <v-table hover>
              <thead>
                <tr>
                  <th class="text-left">Regra</th>
                  <th class="text-left">Prazo</th>
                  <th class="text-left">Destino</th>
                  <th class="text-left">Situação</th>
                  <th class="text-left">Travada</th>
                  <th class="text-left">Criada em</th>
                  <th class="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rule in rules" :key="rule.id">
                  <td class="font-weight-medium">#{{ rule.id }}</td>
                  <td>{{ rule.days }} {{ rule.days === 1 ? 'dia' : 'dias' }}</td>
                  <td>{{ DISPOSITION_LABELS[rule.destination] }}</td>
                  <td>
                    <v-chip
                      size="small"
                      :color="rule.active ? 'success' : 'outline'"
                      variant="tonal"
                    >
                      {{ rule.active ? 'Ativa' : 'Inativa' }}
                    </v-chip>
                  </td>
                  <td>
                    <v-chip
                      v-if="rule.locked"
                      size="small"
                      color="warning"
                      variant="tonal"
                      prepend-icon="mdi-lock-outline"
                    >
                      Travada
                    </v-chip>
                    <span v-else class="text-medium-emphasis">—</span>
                  </td>
                  <td>{{ formatDateTime(rule.createdAt) }}</td>
                  <td class="text-right text-no-wrap">
                    <v-btn
                      icon="mdi-pencil-outline"
                      size="small"
                      variant="text"
                      color="primary"
                      aria-label="Editar regra"
                      :title="
                        canModifyRule(rule)
                          ? 'Editar regra'
                          : 'Regras travadas só podem ser alteradas por SUPERADMIN'
                      "
                      :disabled="!canModifyRule(rule) || submitting || deletingRuleId !== null"
                      @click="openEdit(rule)"
                    />
                    <v-btn
                      icon="mdi-delete-outline"
                      size="small"
                      variant="text"
                      color="error"
                      aria-label="Excluir regra"
                      :title="
                        canModifyRule(rule)
                          ? 'Excluir regra'
                          : 'Regras travadas só podem ser excluídas por SUPERADMIN'
                      "
                      :disabled="!canModifyRule(rule) || submitting || deletingRuleId !== null"
                      :loading="deletingRuleId === rule.id"
                      @click="requestDeleteRule(rule)"
                    />
                  </td>
                </tr>
              </tbody>
            </v-table>
          </div>
        </v-card>

        <EmptyState
          v-else-if="!loading"
          icon="mdi-format-list-numbered"
          :title="activeFilter === 'all' ? 'Nenhuma regra cadastrada' : 'Nenhuma regra encontrada'"
          :description="
            activeFilter === 'all'
              ? 'Cadastre a primeira regra para permitir o processamento de elegibilidade.'
              : 'Nenhuma regra corresponde ao filtro selecionado.'
          "
        />
      </template>
    </LoadingOverlay>

    <v-dialog v-model="editorOpen" max-width="520" persistent>
      <v-card class="rounded-lg pa-2">
        <v-card-title class="text-h6 font-weight-bold text-primary px-4 pt-4">
          {{ editorMode === 'create' ? 'Nova regra de destinação' : 'Editar regra de destinação' }}
        </v-card-title>

        <v-card-text class="px-4 py-3">
          <v-alert v-if="formError" type="error" variant="tonal" class="mb-4 rounded-lg">
            {{ formError }}
          </v-alert>

          <v-text-field
            v-model="daysInput"
            label="Prazo em dias *"
            variant="outlined"
            density="comfortable"
            inputmode="numeric"
            :error-messages="daysError ? [daysError] : []"
            :disabled="submitting"
            class="mb-2"
          />

          <v-select
            v-model="destination"
            :items="DISPOSITION_OPTIONS"
            item-title="title"
            item-value="value"
            label="Destino *"
            variant="outlined"
            density="comfortable"
            :error-messages="destinationError ? [destinationError] : []"
            :disabled="submitting"
            class="mb-3"
          />

          <template v-if="editorMode === 'edit'">
            <v-switch
              v-model="activeValue"
              label="Regra ativa"
              color="primary"
              hide-details
              :disabled="submitting"
              class="mb-2"
            />
            <v-switch
              v-if="isSuperAdmin"
              v-model="lockedValue"
              label="Regra travada"
              color="warning"
              hide-details
              :disabled="submitting"
              class="mb-2"
            />
            <p v-else class="text-caption text-medium-emphasis">
              O campo “travada” só pode ser alterado por SUPERADMIN.
            </p>
          </template>
          <p v-else class="text-caption text-medium-emphasis">
            A regra será criada ativa e destravada pelo servidor.
          </p>
        </v-card-text>

        <v-card-actions class="px-4 pb-4 pt-2">
          <v-spacer />
          <v-btn variant="text" class="text-none" :disabled="submitting" @click="closeEditor">
            Cancelar
          </v-btn>
          <v-btn
            color="primary"
            class="text-none"
            :loading="submitting"
            :disabled="submitting"
            @click="submitRule"
          >
            {{ editorMode === 'create' ? 'Cadastrar regra' : 'Salvar alterações' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
