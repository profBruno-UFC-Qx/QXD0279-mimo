<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { email, required } from '@/utils/rules'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const emailAddress = ref('')
const password = ref('')
const valid = ref(false)

const { running: loading, run } = useAsyncAction(async () => {
  await auth.login({ email: emailAddress.value, password: password.value })
  const redirect = route.query.redirect
  await router.push(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/')
}, 'Login realizado com sucesso!', 'E-mail ou senha inválidos.')

async function handleLogin() {
  if (valid.value) await run()
}
</script>

<template>
  <div class="d-flex justify-center py-8 py-sm-12">
    <v-card width="430" max-width="100%" class="pa-6 pa-sm-8">
      <div class="text-center mb-6">
        <v-icon icon="mdi-lock-outline" size="40" color="primary" class="mb-2" />
        <h1 class="text-h5 font-weight-bold">Entrar</h1>
        <p class="text-body-2 text-medium-emphasis">Acesse sua conta para gerenciar perdas e notificações.</p>
      </div>
      <v-form v-model="valid" @submit.prevent="handleLogin">
        <v-text-field
          v-model="emailAddress"
          label="E-mail *"
          type="email"
          autocomplete="email"
          prepend-inner-icon="mdi-email-outline"
          :rules="[required, email]"
          class="mb-2"
        />
        <v-text-field
          v-model="password"
          label="Senha *"
          type="password"
          autocomplete="current-password"
          prepend-inner-icon="mdi-key-outline"
          :rules="[required]"
          class="mb-4"
        />
        <v-btn type="submit" color="primary" block size="large" :loading="loading" :disabled="!valid">
          Entrar
        </v-btn>
      </v-form>
      <p class="text-center text-body-2 mt-6 mb-0">
        Ainda não tem conta?
        <router-link to="/registrar" class="text-primary font-weight-bold text-decoration-none">Criar conta</router-link>
      </p>
    </v-card>
  </div>
</template>
