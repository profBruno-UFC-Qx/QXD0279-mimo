import { computed, onMounted, ref, watch } from 'vue'
import type {
  CreateDispositionRulePayload,
  DispositionRule,
  DispositionType,
  UpdateDispositionRulePayload,
} from '@/types'
import { dispositionRuleService } from '@/services/dispositionRule.service'
import { useAdminSession } from './useAdminSession'
import { useUiStore } from '@/stores/uiStore'
import { extractLostReportErrorMessage, getErrorStatus, isPositiveSafeId } from '@/utils/lostReport'
import { DISPOSITION_LABELS } from '@/utils/dispositions'
import { type ActiveFilter } from '@/types/adminFilters'

export function useAdminDispositionRules() {
  const { auth, hasAccess: hasAdminAccess } = useAdminSession()
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

  return {
    hasAdminAccess,
    loading,
    loadRules,
    submitting,
    deletingRuleId,
    openCreate,
    activeFilter,
    rules,
    isSuperAdmin,
    listError,
    canModifyRule,
    openEdit,
    requestDeleteRule,
    editorOpen,
    daysInput,
    destination,
    activeValue,
    lockedValue,
    editorMode,
    formError,
    daysError,
    destinationError,
    closeEditor,
    submitRule,
  }
}
