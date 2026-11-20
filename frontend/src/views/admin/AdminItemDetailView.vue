<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AdminItemDetails, DispositionType } from '@/types'
import { adminItemService } from '@/services/adminItem.service'
import { useAuthStore } from '@/stores/authStore'
import { useBuildingsStore } from '@/stores/buildingsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useUiStore } from '@/stores/uiStore'
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import StatusChip from '@/components/common/StatusChip.vue'
import ItemPhotoGallery from '@/components/domain/ItemPhotoGallery.vue'
import { formatDate } from '@/utils/format'
import { extractLostReportErrorMessage, getErrorStatus, parsePositiveReportId } from '@/utils/lostReport'
import { isItemEditable } from '@/utils/adminItems'

const DISPOSITION_LABELS: Record<DispositionType, string> = {
  SOLD: 'Venda',
  AUCTIONED: 'Leilão',
  DONATED: 'Doação',
  DISCARDED: 'Descarte',
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const categoriesStore = useCategoriesStore()
const buildingsStore = useBuildingsStore()

const details = ref<AdminItemDetails | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const notFound = ref(false)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

const hasAdminAccess = computed(() => auth.isAuthenticated && auth.isAdmin)
const itemId = computed(() => parsePositiveReportId(String(route.params.id ?? '')))
const isEditable = computed(() => details.value !== null && isItemEditable(details.value.item.status))
const categoryName = computed(() => {
  const id = details.value?.item.categoryId
  if (id === undefined) return '-'
  return categoriesStore.items.find((c) => c.id === id)?.name ?? `Categoria #${id}`
})
const buildingName = computed(() => {
  const id = details.value?.item.buildingId
  if (id === undefined) return '-'
  return buildingsStore.items.find((b) => b.id === id)?.name ?? `Prédio #${id}`
})

async function loadDetails() {
  const id = itemId.value
  details.value = null
  loadError.value = null
  notFound.value = false
  deleteError.value = null

  if (id === null) {
    notFound.value = true
    return
  }

  loading.value = true
  try {
    details.value = await adminItemService.getById(id)
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      notFound.value = true
    } else if (httpStatus === 403) {
      loadError.value = 'Sua sessão não possui permissão administrativa para consultar itens.'
    } else {
      loadError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível carregar os detalhes do item. Tente novamente.',
      )
    }
  } finally {
    loading.value = false
  }
}

function goBack() {
  void router.push({ name: 'admin-items' })
}

function openEdit() {
  if (!details.value || !isEditable.value) return
  void router.push({ name: 'admin-item-edit', params: { id: details.value.item.id } })
}

async function requestDelete() {
  if (!details.value || !isEditable.value || deleting.value) return

  const confirmed = await ui.confirm({
    title: 'Excluir item?',
    message: `Deseja realmente excluir "${details.value.item.title}"? Itens com histórico não podem ser excluídos.`,
    danger: true,
    confirmText: 'Excluir item',
    cancelText: 'Cancelar',
  })
  if (!confirmed) return

  deleting.value = true
  deleteError.value = null
  try {
    await adminItemService.remove(details.value.item.id)
    ui.notifySuccess('Item excluído com sucesso.')
    await router.push({ name: 'admin-items' })
  } catch (err: unknown) {
    const httpStatus = getErrorStatus(err)
    if (httpStatus === 404) {
      deleteError.value = 'Este item já foi removido anteriormente.'
    } else if (httpStatus === 409) {
      deleteError.value = extractLostReportErrorMessage(
        err,
        'Este item possui histórico e não pode ser excluído.',
      )
    } else if (httpStatus === 403) {
      deleteError.value = 'Sua sessão não possui permissão administrativa para excluir itens.'
    } else {
      deleteError.value = extractLostReportErrorMessage(
        err,
        'Não foi possível excluir o item. Tente novamente.',
      )
    }
  } finally {
    deleting.value = false
  }
}

watch(itemId, () => void loadDetails(), { immediate: true })

onMounted(() => {
  void categoriesStore.ensureLoaded()
  void buildingsStore.ensureLoaded()
})
</script>

<template>
  <div>
    <PageHeader
      title="Detalhes do item"
      subtitle="Visualize as informações e as fotos do objeto encontrado."
    >
      <template #actions>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-arrow-left"
            @click="goBack"
          >
            Voltar
          </v-btn>
          <v-btn
            v-if="details"
            variant="outlined"
            color="primary"
            class="text-none"
            prepend-icon="mdi-pencil-outline"
            :disabled="!hasAdminAccess || !isEditable || deleting"
            @click="openEdit"
          >
            Editar
          </v-btn>
          <v-btn
            v-if="details"
            variant="tonal"
            color="error"
            class="text-none"
            prepend-icon="mdi-delete-outline"
            :disabled="!hasAdminAccess || !isEditable || deleting"
            :loading="deleting"
            @click="requestDelete"
          >
            Excluir
          </v-btn>
        </div>
      </template>
    </PageHeader>

    <v-alert v-if="deleteError" type="error" variant="tonal" class="mb-4 rounded-lg">
      {{ deleteError }}
    </v-alert>

    <div v-if="notFound" class="py-4">
      <v-alert type="warning" variant="tonal" class="rounded-lg">
        <div class="d-flex align-center justify-space-between flex-wrap ga-2">
          <span>Item não encontrado ou identificador inválido.</span>
          <v-btn size="small" variant="text" color="primary" class="text-none" @click="goBack">
            Voltar para a listagem
          </v-btn>
        </div>
      </v-alert>
    </div>

    <ErrorAlert v-else-if="loadError" :error="loadError" @retry="loadDetails()" />

    <LoadingOverlay :loading="loading" text="Carregando detalhes do item...">
      <v-row v-if="details">
        <v-col cols="12" md="6">
          <ItemPhotoGallery :photos="details.photos" />
        </v-col>

        <v-col cols="12" md="6">
          <v-card variant="flat" class="rounded-lg border pa-5 h-100">
            <div class="d-flex align-start justify-space-between flex-wrap ga-3 mb-3">
              <div>
                <h2 class="text-h5 font-weight-bold text-primary mb-1">
                  {{ details.item.title }}
                </h2>
                <span class="text-body-2 text-medium-emphasis">Item #{{ details.item.id }}</span>
              </div>
              <StatusChip :status="details.item.status" />
            </div>

            <p class="text-body-1 mb-4">
              {{ details.item.description || 'Sem descrição informada.' }}
            </p>

            <v-divider class="mb-4" />

            <div class="d-flex flex-column ga-3 text-body-2">
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-tag-outline" size="18" color="primary" />
                <span><strong>Categoria:</strong> {{ categoryName }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-domain" size="18" color="primary" />
                <span><strong>Prédio:</strong> {{ buildingName }}</span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-map-marker-outline" size="18" color="primary" />
                <span>
                  <strong>Local do achado:</strong>
                  {{ details.item.foundLocation || 'Não informado' }}
                </span>
              </div>
              <div class="d-flex align-center ga-2">
                <v-icon icon="mdi-calendar-outline" size="18" color="primary" />
                <span><strong>Data do achado:</strong> {{ formatDate(details.item.foundDate) }}</span>
              </div>
              <div v-if="details.item.plannedDestination" class="d-flex align-center ga-2">
                <v-icon icon="mdi-target" size="18" color="primary" />
                <span>
                  <strong>Destino planejado:</strong>
                  {{ DISPOSITION_LABELS[details.item.plannedDestination] }}
                </span>
              </div>
            </div>

            <v-alert
              v-if="!isEditable"
              type="info"
              variant="tonal"
              density="compact"
              class="mt-5 rounded-lg"
            >
              Itens entregues ou destinados não podem ser editados ou excluídos.
            </v-alert>
          </v-card>
        </v-col>
      </v-row>
    </LoadingOverlay>
  </div>
</template>
