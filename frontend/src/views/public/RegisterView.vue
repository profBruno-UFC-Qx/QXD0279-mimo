<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { email, required } from '@/utils/rules'

const router = useRouter()
const auth = useAuthStore()
const name = ref('')
const emailAddress = ref('')
const phone = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const valid = ref(false)

const passwordsMatch = (value: unknown) => value === password.value || 'As senhas não coincidem.'

const { running: loading, run } = useAsyncAction(async () => {
  await auth.register({ name: name.value, email: emailAddress.value, phone: phone.value, password: password.value })
  // O endpoint de cadastro devolve apenas o usuário; autentica em seguida para iniciar a sessão.
  await auth.login({ email: emailAddress.value, password: password.value })
  await router.push('/')
}, 'Conta criada com sucesso!', 'Não foi possível realizar o cadastro. Confira os dados e tente novamente.')

async function handleRegister() {
  if (valid.value) await run()
}
</script>

<template>
  <div class="d-flex justify-center py-6 py-sm-10">
    <v-card width="430" max-width="100%" class="pa-6 pa-sm-8">
      <div class="text-center mb-6">
        <v-icon icon="mdi-account-plus-outline" size="40" color="primary" class="mb-2" />
        <h1 class="text-h5 font-weight-bold">Criar conta</h1>
        <p class="text-body-2 text-medium-emphasis">Cadastre-se para registrar perdas e receber alertas.</p>
      </div>
      <v-form v-model="valid" @submit.prevent="handleRegister">
        <v-text-field v-model="name" label="Nome completo *" autocomplete="name" :rules="[required]" />
        <v-text-field
          v-model="emailAddress"
          label="E-mail *"
          type="email"
          autocomplete="email"
          :rules="[required, email]"
        />
        <v-text-field
          v-model="phone"
          label="Telefone / WhatsApp *"
          type="tel"
          autocomplete="tel"
          :rules="[required]"
        />
        <v-text-field
          v-model="password"
          label="Senha *"
          type="password"
          autocomplete="new-password"
          :rules="[required]"
        />
        <v-text-field
          v-model="passwordConfirmation"
          label="Confirmar senha *"
          type="password"
          autocomplete="new-password"
          :rules="[required, passwordsMatch]"
          class="mb-2"
        />
        <v-btn type="submit" color="primary" block size="large" :loading="loading" :disabled="!valid">
          Criar conta
        </v-btn>
      </v-form>
      <p class="text-center text-body-2 mt-6 mb-0">
        Já possui conta?
        <router-link to="/entrar" class="text-primary font-weight-bold text-decoration-none">Entrar</router-link>
      </p>
    </v-card>
  </div>
</template>
