<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const email = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!email.value || !password.value) {
    ui.notifyError('Preencha e-mail e senha.')
    return
  }
  loading.value = true
  try {
    await auth.login({ email: email.value, password: password.value })
    ui.notifySuccess('Login realizado com sucesso!')
    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  } catch (err: any) {
    ui.notifyError(err.response?.data?.message || 'E-mail ou senha inválidos.')
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="d-flex justify-center align-center py-12">
    <v-card width="420" max-width="90vw" class="pa-8 rounded-lg elevation-2">
      <div class="text-center mb-6">
        <v-icon icon="mdi-lock-outline" size="40" color="primary" class="mb-2" />
        <h1 class="text-h5 font-weight-bold">Entrar no Achadex</h1>
        <p class="text-body-2 text-medium-emphasis">Acesse sua conta para gerenciar perdas e notificações</p>
      </div>

      <v-form @submit.prevent="handleLogin">
        <v-text-field
          v-model="email"
          label="E-mail"
          type="email"
          required
          class="mb-3"
          prepend-inner-icon="mdi-email-outline"
        />
        <v-text-field
          v-model="password"
          label="Senha"
          type="password"
          required
          class="mb-6"
          prepend-inner-icon="mdi-key-outline"
        />
        <v-btn
          type="submit"
          color="primary"
          block
          size="large"
          :loading="loading"
          class="text-none font-weight-bold"
        >
          Entrar
        </v-btn>
      </v-form>

      <div class="text-center mt-6 text-body-2 text-medium-emphasis">
        Ainda não tem conta? <router-link to="/registrar" class="text-primary font-weight-bold text-decoration-none">Criar conta</router-link>
      </div>
    </v-card>
  </div>
</template>
