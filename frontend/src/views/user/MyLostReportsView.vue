<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import LoadingOverlay from '@/components/common/LoadingOverlay.vue'
import ErrorAlert from '@/components/common/ErrorAlert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LostReportCard from '@/components/domain/LostReportCard.vue'
import { useMyLostReports } from '@/composables/user/useMyLostReports'

const {
  auth,
  reports,
  selectedStatus,
  filteredReports,
  loading,
  error,
  loadReports,
} = useMyLostReports()
</script>

<template>
  <div>
    <PageHeader
      title="Minhas perdas"
      subtitle="Acompanhe os objetos perdidos que você registrou."
    >
      <template #actions>
        <v-btn
          color="primary"
          class="text-none"
          prepend-icon="mdi-plus"
          :to="{ name: 'new-lost-report' }"
        >
          Registrar perda
        </v-btn>
      </template>
    </PageHeader>

    <ErrorAlert
      v-if="error"
      :error="error"
      @retry="loadReports"
    />

    <LoadingOverlay :loading="loading" text="Carregando suas perdas...">
      <template v-if="!error">
        <template v-if="reports.length > 0">
          <v-btn-toggle
            v-model="selectedStatus"
            mandatory
            color="primary"
            variant="outlined"
            density="comfortable"
            divided
            class="mb-5 flex-wrap"
          >
            <v-btn value="ALL" class="text-none">Todas</v-btn>
            <v-btn value="OPEN" class="text-none">Abertas</v-btn>
            <v-btn value="RESOLVED" class="text-none">Resolvidas</v-btn>
            <v-btn value="CANCELLED" class="text-none">Canceladas</v-btn>
          </v-btn-toggle>

          <v-row v-if="filteredReports.length > 0">
            <v-col
              v-for="report in filteredReports"
              :key="report.id"
              cols="12"
              md="6"
            >
              <LostReportCard :lost-report="report">
                <template #actions>
                  <v-btn
                    size="small"
                    variant="text"
                    color="primary"
                    class="text-none"
                    prepend-icon="mdi-eye-outline"
                    :to="{ name: 'lost-report-detail', params: { id: report.id } }"
                  >
                    Ver detalhes
                  </v-btn>
                </template>
              </LostReportCard>
            </v-col>
          </v-row>

          <EmptyState
            v-else
            icon="mdi-filter-off-outline"
            title="Nenhuma perda encontrada para este filtro."
            compact
          >
            <template #action>
              <v-btn
                variant="outlined"
                color="primary"
                class="text-none"
                @click="selectedStatus = 'ALL'"
              >
                Mostrar todas
              </v-btn>
            </template>
          </EmptyState>
        </template>

        <EmptyState
          v-else-if="!loading && auth.token"
          icon="mdi-alert-box-outline"
          title="Nenhuma perda registrada"
          description="Quando você registrar um objeto perdido, ele aparecerá aqui para acompanhamento."
        >
          <template #action>
            <v-btn
              color="primary"
              class="text-none"
              prepend-icon="mdi-plus"
              :to="{ name: 'new-lost-report' }"
            >
              Registrar perda
            </v-btn>
          </template>
        </EmptyState>
      </template>
    </LoadingOverlay>
  </div>
</template>
