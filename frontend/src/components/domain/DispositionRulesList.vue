<script setup lang="ts">
import AdminTable from '@/components/common/AdminTable.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatDateTime } from '@/utils/format'
import { DISPOSITION_LABELS } from '@/utils/dispositions'
import type { DispositionRule } from '@/types'
import { type ActiveFilter } from '@/types/adminFilters'
import AppPill from '@/components/common/AppPill.vue'

defineProps<{
  loading: boolean
  listError: string | null
  rules: DispositionRule[]
  canModifyRule: (rule: DispositionRule) => boolean
  submitting: boolean
  deletingRuleId: number | null
  activeFilter: ActiveFilter
}>()

defineEmits<{
  'open-edit': [rule: DispositionRule]
  'request-delete-rule': [rule: DispositionRule]
}>()
</script>

<template>
  <LoadingOverlay :loading="loading" text="Carregando regras de destinação...">
    <template v-if="!listError">
      <AdminTable v-if="rules.length > 0">
        <thead>
          <tr>
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
            <td>{{ rule.days }} {{ rule.days === 1 ? 'dia' : 'dias' }}</td>
            <td>{{ DISPOSITION_LABELS[rule.destination] }}</td>
            <td>
              <AppPill
                size="small"
                :color="rule.active ? 'success' : 'on-surface'"
              >
                {{ rule.active ? 'Ativa' : 'Inativa' }}
              </AppPill>
            </td>
            <td>
              <AppPill
                v-if="rule.locked"
                size="small"
                color="warning"
                icon="mdi-lock-outline"
              >
                Travada
              </AppPill>
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
                @click="$emit('open-edit', rule)"
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
                @click="$emit('request-delete-rule', rule)"
              />
            </td>
          </tr>
        </tbody>
      </AdminTable>

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
</template>
