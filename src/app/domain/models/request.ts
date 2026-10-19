import { Scope } from './rbac';

export type ServiceKey =
  | 'building-maintenance'
  | 'works-execution'
  | 'vehicle-maintenance'
  | 'traffic-violation'
  | 'traffic-accident'
  | 'purchase-request'
  | 'warehouse-need'
  | 'internal-event'
  | 'bus-booking'
  | 'complaint';

export type ServiceGroup = 'maintenance' | 'procurement' | 'activities' | 'quality';

export type Priority = 'normal' | 'urgent' | 'emergency' | 'high' | 'preventive';

/** Single status set shared by every service. */
export type RequestStatus =
  | 'new'
  | 'under_review'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'on_hold'
  | 'executed'
  | 'pending_confirmation'
  | 'closed'
  | 'rejected'
  | 'cancelled'
  | 'returned';

export type HoldReason = 'parts' | 'procurement' | 'requester_info';

export type TimelineEventType =
  | 'created'
  | 'routed'
  | 'status'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'assigned'
  | 'comment'
  | 'inspection'
  | 'part_requested'
  | 'part_issued'
  | 'linked_created'
  | 'linked_completed'
  | 'escalated'
  | 'sla_breach'
  | 'confirmed'
  | 'rated'
  | 'cancelled'
  | 'complaint_linked'
  | 'system';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  at: string;
  actorId: string | null;
  /** Role label captured at event time, or `النظام` for system events. */
  actorRoleAr: string;
  textAr: string;
  noteAr?: string;
  /** Events about internal comments; stripped for users without `request.comment.internal`. */
  internal?: boolean;
}

export interface RequestComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRoleAr: string;
  at: string;
  textAr: string;
  /** Internal comments are visible only to users with `request.comment.internal`. */
  internal: boolean;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  sizeBytes: number;
  mime: string;
  uploadedBy: string;
  at: string;
}

export interface ApprovalStep {
  id: string;
  /** Permission that authorises this step, e.g. `request.approve.finance`. */
  permissionKey: string;
  labelAr: string;
  state: 'pending' | 'approved' | 'rejected' | 'returned' | 'skipped';
  actorId?: string;
  at?: string;
  noteAr?: string;
}

export interface CostLine {
  id: string;
  kind: 'part' | 'labour' | 'purchase' | 'other';
  descriptionAr: string;
  quantity: number;
  unitCost: number;
}

export interface RequestLink {
  requestId: string;
  relation: 'parent' | 'child' | 'related' | 'complaint';
}

export interface SlaState {
  targetHours: number;
  /** `null` until the request is routed to its executor (the clock has not started). */
  startedAt: string | null;
  /** Total time the clock was paused (on hold / awaiting confirmation), in ms. */
  pausedMs: number;
  pausedSince?: string;
  /** Set when the work is done; freezes the clock. */
  stoppedAt?: string;
  breached: boolean;
  escalated: boolean;
}

export type ConfirmationOutcome = 'accepted' | 'accepted_with_note' | 'rejected';

export interface Confirmation {
  outcome: ConfirmationOutcome;
  noteAr?: string;
  at: string;
}

export interface Rating {
  stars: 1 | 2 | 3 | 4 | 5;
  noteAr?: string;
  at: string;
}

export interface ServiceRequest {
  id: string;
  /** Human reference, e.g. `MNH-2026-000123`. */
  refNo: string;
  service: ServiceKey;
  titleAr: string;
  descriptionAr: string;
  requesterId: string;
  requesterName: string;
  requesterMobile: string;
  branchId: string | null;
  departmentId: string | null;
  priority: Priority;
  status: RequestStatus;
  holdReason?: HoldReason;
  /** Mandatory when rejected, returned or on hold. */
  statusNoteAr?: string;
  assigneeId?: string | null;
  assigneeName?: string;
  neededBy?: string;
  /** Estimated/actual value in SAR; drives the approval chain for purchases and works. */
  estimatedValue: number;
  createdAt: string;
  updatedAt: string;
  /** Service-specific form values. Typed per service by the form definitions. */
  details: Record<string, unknown>;
  timeline: TimelineEvent[];
  comments: RequestComment[];
  attachments: AttachmentMeta[];
  approvals: ApprovalStep[];
  costs: CostLine[];
  links: RequestLink[];
  sla: SlaState;
  rating?: Rating;
  confirmation?: Confirmation;
  /** Restricted visibility (accidents, violations, confidential complaints). */
  confidential: boolean;
}

export interface ServiceDefinition {
  key: ServiceKey;
  nameAr: string;
  descriptionAr: string;
  group: ServiceGroup;
  icon: string;
  /** Permission needed to create this service. */
  createPermission: string;
  /** Scope at which a branch/department-less executor sees this service by default. */
  defaultExecutorScope: Scope;
}
