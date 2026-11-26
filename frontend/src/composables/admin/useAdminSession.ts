import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'

export interface AdminSessionSnapshot {
  token: string | null
  userId: number | null
  role: string | null
  generation: number
}

export function useAdminSession(superAdminOnly = false) {
  const auth = useAuthStore()
  const hasAccess = computed(() =>
    auth.isAuthenticated && (superAdminOnly ? auth.isSuperAdmin : auth.isAdmin),
  )

  function captureSession(): AdminSessionSnapshot {
    return {
      token: auth.token,
      userId: auth.user?.id ?? null,
      role: auth.user?.role ?? null,
      generation: auth.sessionGeneration,
    }
  }

  function isSameSession(snapshot: AdminSessionSnapshot): boolean {
    return (
      hasAccess.value &&
      auth.token === snapshot.token &&
      (auth.user?.id ?? null) === snapshot.userId &&
      (auth.user?.role ?? null) === snapshot.role &&
      auth.sessionGeneration === snapshot.generation
    )
  }

  return { auth, hasAccess, captureSession, isSameSession }
}
