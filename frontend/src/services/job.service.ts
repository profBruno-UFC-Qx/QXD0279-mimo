import { api } from './api'
import { extractDispositionEligibilityUpdatedCount } from '@/utils/dashboardMetrics'

export interface DispositionEligibilityResult {
  updatedCount: number
}

/**
 * Service for manual execution of administrative backend jobs.
 */
export const jobService = {
  async runDispositionEligibility(): Promise<DispositionEligibilityResult> {
    const { data } = await api.post<DispositionEligibilityResult>('/jobs/disposition-eligibility')
    const updatedCount = extractDispositionEligibilityUpdatedCount(data)
    return { updatedCount }
  },
}
