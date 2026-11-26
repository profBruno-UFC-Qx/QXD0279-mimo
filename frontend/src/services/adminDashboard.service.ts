import type { ItemStatus, LostReportStatus } from '@/types'
import { extractPaginationTotal } from '@/utils/dashboardMetrics'
import { adminItemService } from './adminItem.service'
import { adminLostReportService } from './adminLostReport.service'

export const adminDashboardService = {
  async countLostReports(status?: LostReportStatus): Promise<number> {
    const query = { page: 1, per_page: 1, ...(status ? { status } : {}) }
    return extractPaginationTotal(await adminLostReportService.list(query))
  },

  async countItems(status: ItemStatus): Promise<number> {
    return extractPaginationTotal(await adminItemService.list({ status, page: 1, per_page: 1 }))
  },
}
