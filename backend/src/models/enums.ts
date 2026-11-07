export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}

export enum ItemStatus {
  AVAILABLE = 'AVAILABLE',
  ELIGIBLE = 'ELIGIBLE',
  HANDED_OVER = 'HANDED_OVER',
  SOLD = 'SOLD',
  AUCTIONED = 'AUCTIONED',
  DONATED = 'DONATED',
  DISCARDED = 'DISCARDED',
}

export enum LostReportStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

export enum DispositionType {
  SOLD = 'SOLD',
  AUCTIONED = 'AUCTIONED',
  DONATED = 'DONATED',
  DISCARDED = 'DISCARDED',
}

export enum NotificationType {
  MATCH_FOUND = 'MATCH_FOUND',
  ITEM_CLAIMED = 'ITEM_CLAIMED',
  REPORT_RESOLVED = 'REPORT_RESOLVED',
}
