import { api } from './api'

export const jobService = {
  async runDispositionEligibility(): Promise<{ updatedCount: number }> {
    const { data } = await api.post<{ updatedCount: number }>('/jobs/disposition-eligibility')
    return data
  },
}
