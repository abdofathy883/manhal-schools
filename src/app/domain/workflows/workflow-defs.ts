import { ApprovalLimits } from '../models/platform';
import { Priority, ServiceKey } from '../models/request';
import { ROLE_IDS } from '../seed/roles.seed';

export interface ChainInput {
  service: ServiceKey;
  priority: Priority;
  estimatedValue: number;
  details: Record<string, unknown>;
}

export interface ApprovalSpec {
  permissionKey: string;
  labelAr: string;
}

/** Data-driven description of a service's path through the shared request engine. */
export interface ServiceWorkflow {
  service: ServiceKey;
  /** A reviewer (`request.review`) must accept the request before approvals/routing. */
  reviewRequired: boolean;
  reviewerLabelAr: string;
  /** The requester confirms the result before the request closes. */
  confirmRequired: boolean;
  /** Who receives the request after approval (used in routing messages). */
  executorLabelAr: string;
  /** Role whose members are notified when an SLA is breached or a request is escalated. */
  escalateToRoleId: string;
  escalateToLabelAr: string;
  confidential: (details: Record<string, unknown>) => boolean;
  /** Ordered approval chain for this request, computed from its value/priority and the financial limits. */
  approvals: (input: ChainInput, limits: ApprovalLimits) => ApprovalSpec[];
}

const DEPT: ApprovalSpec = { permissionKey: 'request.approve.department', labelAr: 'اعتماد مدير القسم' };
const BRANCH: ApprovalSpec = { permissionKey: 'request.approve.branch', labelAr: 'اعتماد مشرف الفرع' };
const FINANCE: ApprovalSpec = { permissionKey: 'request.approve.finance', labelAr: 'اعتماد الإدارة المالية' };
const EXECUTIVE: ApprovalSpec = { permissionKey: 'request.approve.executive', labelAr: 'اعتماد الإدارة العليا' };
const TRANSPORT: ApprovalSpec = { permissionKey: 'transport.allocate', labelAr: 'اعتماد مسؤول النقل' };

/** Department manager, plus finance above the department limit, plus executive above the finance limit. */
const byValue = (input: ChainInput, limits: ApprovalLimits): ApprovalSpec[] => {
  const chain = [DEPT];
  if (input.estimatedValue > limits.departmentMax) chain.push(FINANCE);
  if (input.estimatedValue > limits.financeMax) chain.push(EXECUTIVE);
  return chain;
};

export const LARGE_EVENT_ATTENDEES = 400;

const never = () => false;
const exec = { escalateToRoleId: ROLE_IDS.executive, escalateToLabelAr: 'الإدارة العليا' };
const maint = { escalateToRoleId: ROLE_IDS.maintenanceLead, escalateToLabelAr: 'مسؤول الصيانة' };

export const WORKFLOWS: Readonly<Record<ServiceKey, ServiceWorkflow>> = {
  'building-maintenance': {
    service: 'building-maintenance',
    reviewRequired: false,
    reviewerLabelAr: 'فريق الصيانة',
    confirmRequired: true,
    executorLabelAr: 'فريق الصيانة',
    ...maint,
    confidential: never,
    // Emergencies are approved automatically; anything else needs the branch supervisor.
    approvals: (i) => (i.priority === 'emergency' ? [] : [BRANCH]),
  },
  'works-execution': {
    service: 'works-execution',
    reviewRequired: false,
    reviewerLabelAr: 'فريق الصيانة',
    confirmRequired: true,
    executorLabelAr: 'فريق الصيانة أو المقاول',
    ...maint,
    confidential: never,
    approvals: byValue,
  },
  'vehicle-maintenance': {
    service: 'vehicle-maintenance',
    reviewRequired: true,
    reviewerLabelAr: 'الورشة المركزية',
    confirmRequired: true,
    executorLabelAr: 'الورشة المركزية',
    ...exec,
    confidential: never,
    approvals: () => [],
  },
  'traffic-violation': {
    service: 'traffic-violation',
    reviewRequired: true,
    reviewerLabelAr: 'الورشة المركزية',
    confirmRequired: false,
    executorLabelAr: 'الورشة المركزية',
    ...exec,
    confidential: () => true,
    approvals: () => [],
  },
  'traffic-accident': {
    service: 'traffic-accident',
    reviewRequired: true,
    reviewerLabelAr: 'الورشة المركزية',
    confirmRequired: false,
    executorLabelAr: 'الورشة المركزية',
    ...exec,
    confidential: () => true,
    approvals: () => [],
  },
  'purchase-request': {
    service: 'purchase-request',
    reviewRequired: false,
    reviewerLabelAr: 'المشتريات',
    confirmRequired: true,
    executorLabelAr: 'قسم المشتريات',
    ...exec,
    confidential: never,
    approvals: byValue,
  },
  'warehouse-need': {
    service: 'warehouse-need',
    reviewRequired: false,
    reviewerLabelAr: 'أمين المستودع',
    confirmRequired: true,
    executorLabelAr: 'أمين المستودع',
    ...exec,
    confidential: never,
    approvals: () => [DEPT],
  },
  'internal-event': {
    service: 'internal-event',
    reviewRequired: false,
    reviewerLabelAr: 'مشرف الفرع',
    confirmRequired: true,
    executorLabelAr: 'مسؤول الفعاليات في الفرع',
    ...exec,
    confidential: never,
    // Large events (more than LARGE_EVENT_ATTENDEES guests) also need senior management.
    approvals: (i) => (Number(i.details['attendees'] ?? 0) > LARGE_EVENT_ATTENDEES ? [BRANCH, EXECUTIVE] : [BRANCH]),
  },
  'bus-booking': {
    service: 'bus-booking',
    reviewRequired: false,
    reviewerLabelAr: 'مسؤول النقل',
    confirmRequired: false,
    executorLabelAr: 'مسؤول النقل',
    ...exec,
    confidential: never,
    // Within the booking rules the request is auto-approved; otherwise the transport officer decides.
    approvals: (i) => (i.details['withinRules'] === false ? [TRANSPORT] : []),
  },
  complaint: {
    service: 'complaint',
    reviewRequired: true,
    reviewerLabelAr: 'مسؤول الشكاوى',
    confirmRequired: false,
    executorLabelAr: 'مسؤول الشكاوى',
    ...exec,
    confidential: (d) => d['confidential'] === true,
    approvals: () => [],
  },
};
