import { Priority } from './request';

export type Channel = 'whatsapp' | 'sms' | 'email';

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'واتساب',
  sms: 'رسالة نصية',
  email: 'بريد إلكتروني',
};

export const CHANNEL_ICONS: Record<Channel, string> = {
  whatsapp: 'bi-whatsapp',
  sms: 'bi-chat-square-text',
  email: 'bi-envelope',
};

export type NotificationKind = 'status' | 'approval' | 'assignment' | 'sla' | 'comment' | 'info';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  titleAr: string;
  bodyAr: string;
  at: string;
  read: boolean;
  requestId?: string;
  /** Simulated delivery channels (no real messages are sent). */
  channels: Channel[];
}

export type AuditEntityType = 'request' | 'role' | 'user' | 'reference' | 'limits' | 'sla' | 'system';

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  actionAr: string;
  entityType: AuditEntityType;
  entityId: string;
  summaryAr: string;
  before?: unknown;
  after?: unknown;
}

export interface ApprovalLimits {
  /** Up to this amount (SAR) the department manager alone approves. */
  departmentMax: number;
  /** Above `departmentMax` and up to this amount the finance department also approves; above it, executive management too. */
  financeMax: number;
}

export type SlaHours = Record<Priority, number>;

export interface PlatformSettings {
  approvalLimits: ApprovalLimits;
  slaHours: SlaHours;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  approvalLimits: { departmentMax: 5000, financeMax: 50000 },
  slaHours: { emergency: 4, urgent: 24, high: 48, normal: 72, preventive: 168 },
};
