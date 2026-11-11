<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore'
const auth = useAuthStore()
</script>
<template>
  <div>
    <h1 class="text-h4 font-weight-bold mb-2">Meu Perfil</h1>
    <p class="text-body-1 text-medium-emphasis mb-6">Informações da sua conta no sistema.</p>
    <v-card class="pa-6 rounded-lg" max-width="600">
      <v-list density="comfortable">
        <v-list-item title="Nome" :subtitle="auth.user?.name" />
        <v-divider class="my-2" />
        <v-list-item title="E-mail" :subtitle="auth.user?.email" />
        <v-divider class="my-2" />
        <v-list-item title="Telefone" :subtitle="auth.user?.phone || 'Não informado'" />
        <v-divider class="my-2" />
        <v-list-item title="Papel" :subtitle="auth.user?.role" />
      </v-list>
    </v-card>
  </div>
</template>
