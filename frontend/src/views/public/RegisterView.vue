<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const name = ref('')
const email = ref('')
const phone = ref('')
const password = ref('')
const loading = ref(false)

async function handleRegister() {
  if (!name.value || !email.value || !password.value) {
    ui.notifyError('Preencha os campos obrigatórios.')
    return
  }
  loading.value = true
  try {
    await auth.register({ name: name.value, email: email.value, phone: phone.value, password: password.value })
    await auth.login({ email: email.value, password: password.value })
    ui.notifySuccess('Conta criada com sucesso!')
    router.push('/')
  } catch (err: any) {
    ui.notifyError(err.response?.data?.message || 'Não foi possível realizar o cadastro.')
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <div class="d-flex justify-center align-center py-8">
    <v-card width="440" max-width="90vw" class="pa-8 rounded-lg elevation-2">
      <div class="text-center mb-6">
        <v-icon icon="mdi-account-plus-outline" size="40" color="primary" class="mb-2" />
        <h1 class="text-h5 font-weight-bold">Criar Conta</h1>
        <p class="text-body-2 text-medium-emphasis">Cadastre-se para registrar perdas e receber alertas</p>
      </div>

      <v-form @submit.prevent="handleRegister">
        <v-text-field
          v-model="name"
          label="Nome completo"
          required
          class="mb-3"
          prepend-inner-icon="mdi-account-outline"
        />
        <v-text-field
          v-model="email"
          label="E-mail institucional"
          type="email"
          required
          class="mb-3"
          prepend-inner-icon="mdi-email-outline"
        />
        <v-text-field
          v-model="phone"
          label="Telefone / WhatsApp"
          required
          class="mb-3"
          prepend-inner-icon="mdi-phone-outline"
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
          Cadastrar
        </v-btn>
      </v-form>

      <div class="text-center mt-6 text-body-2 text-medium-emphasis">
        Já possui conta? <router-link to="/entrar" class="text-primary font-weight-bold text-decoration-none">Entrar</router-link>
      </div>
    </v-card>
  </div>
</template>
