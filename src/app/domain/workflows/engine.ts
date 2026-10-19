import { BusAllocation, BusSlot, cancellationBlock } from '../bookings/booking-rules';
import { HOLD_REASON_LABELS } from '../reference-data';
import { CLOSURE_KEY, ClosureData, EXECUTION_KEY, ExecutionData, LABOUR_RATE } from '../models/execution';
import { FOR_LINES_KEY, FULFILMENT_KEY, Fulfilment, FulfilmentPlan, IssueLine, PROCUREMENT_KEY, ProcurementData, Quote, ReceiptCondition } from '../models/procurement';
import { ScopedResource } from '../models/rbac';
import {
  ApprovalLimits,
  AuditEntityType,
  Channel,
  NotificationKind,
  SlaHours,
} from '../models/platform';
import {
  AttachmentMeta,
  ConfirmationOutcome,
  CostLine,
  HoldReason,
  Priority,
  RequestComment,
  RequestStatus,
  ServiceKey,
  ServiceRequest,
  TimelineEvent,
  TimelineEventType,
} from '../models/request';
import { SERVICE_BY_KEY } from '../reference-data';
import { buildApprovalChain, currentStep, recomputeChain } from './approval-chain';
import { isTerminal, slaElapsedMs, slaTargetMs } from './sla';
import { WORKFLOWS } from './workflow-defs';

/** Raised for any rule violation; `messageAr` is shown to the user as-is. */
export class WorkflowError extends Error {
  constructor(public readonly messageAr: string) {
    super(messageAr);
  }
}

export type ActionKey =
  | 'start_review'
  | 'review_pass'
  | 'approve'
  | 'reject'
  | 'return'
  | 'resubmit'
  | 'cancel'
  | 'assign'
  | 'start'
  | 'hold'
  | 'resume'
  | 'complete'
  | 'confirm'
  | 'reject_result'
  | 'close'
  | 'rate'
  | 'escalate'
  | 'add_cost'
  | 'save_execution'
  | 'record_closure'
  | 'allocate'
  | 'promote'
  | 'request_parts'
  | 'issue_items'
  | 'save_quotes'
  | 'issue_po'
  | 'receive_goods';

export interface Actor {
  id: string;
  nameAr: string;
  mobile?: string;
}

export interface EngineContext {
  actor: Actor;
  /** Role label recorded on timeline events (`النظام` for system actions). */
  actorRoleAr: string;
  can: (key: string, resource?: ScopedResource) => boolean;
  now: Date;
  limits: ApprovalLimits;
  slaHours: SlaHours;
  /** Ids of users holding a permission for a record (to notify approvers/executors). */
  usersWith: (permissionKey: string, resource: ScopedResource) => string[];
  /** Ids of active users holding a role. */
  roleUsers: (roleId: string) => string[];
}

export interface NotificationDraft {
  userId: string;
  kind: NotificationKind;
  titleAr: string;
  bodyAr: string;
  channels: Channel[];
}

export interface AuditDraft {
  actionAr: string;
  entityType: AuditEntityType;
  summaryAr: string;
  before?: unknown;
  after?: unknown;
}

export interface EngineResult {
  request: ServiceRequest;
  notifications: NotificationDraft[];
  audit: AuditDraft[];
}

export interface ActionPayload {
  noteAr?: string;
  holdReason?: HoldReason;
  assigneeId?: string;
  assigneeName?: string;
  outcome?: ConfirmationOutcome;
  rating?: { stars: 1 | 2 | 3 | 4 | 5; noteAr?: string };
  cost?: Omit<CostLine, 'id'>;
  execution?: ExecutionData;
  closure?: Omit<ClosureData, 'at'>;
  /** Bus bookings: one slot per bus. Conflicts with other bookings are checked by `BookingService`. */
  allocation?: { slots: BusSlot[] };
  /** Stock check of the request's lines, computed by the warehouse service from live stock. */
  fulfilment?: FulfilmentPlan;
  quotes?: { quotes: Quote[]; selectedId?: string };
  po?: { supplierId: string; supplierName: string; amount: number };
  receipt?: { condition: ReceiptCondition; custodyAck: boolean; noteAr?: string };
}

export type ActionDialog = 'none' | 'note' | 'assign' | 'hold' | 'confirm' | 'rate' | 'cost' | 'allocate';
export type ActionTone = 'primary' | 'success' | 'danger' | 'warning' | 'secondary' | 'info';

export interface ActionDescriptor {
  key: ActionKey;
  labelAr: string;
  icon: string;
  tone: ActionTone;
  dialog: ActionDialog;
  noteRequired: boolean;
  enabled: boolean;
  /** Why a visible action cannot be used right now (shown as a tooltip). */
  disabledReasonAr?: string;
}

export interface RequestDraft {
  service: ServiceKey;
  /** Editable contact number; defaults to the requester's registered mobile. */
  requesterMobile?: string;
  titleAr: string;
  descriptionAr: string;
  priority: Priority;
  neededBy?: string;
  details: Record<string, unknown>;
  estimatedValue: number;
  branchId: string | null;
  departmentId: string | null;
  attachments: AttachmentMeta[];
}

// ---------------------------------------------------------------------------------------------
// helpers

const resourceOf = (r: ServiceRequest): ScopedResource => ({
  branchId: r.branchId,
  departmentId: r.departmentId,
  createdBy: r.requesterId,
  assigneeId: r.assigneeId ?? null,
  service: r.service,
});

const isRequester = (r: ServiceRequest, ctx: EngineContext): boolean => r.requesterId === ctx.actor.id;

interface Out {
  notifications: NotificationDraft[];
}

function addEvent(
  r: ServiceRequest,
  ctx: EngineContext,
  type: TimelineEventType,
  textAr: string,
  noteAr?: string,
  internal = false,
): void {
  r.timeline.push({
    id: `ev-${r.timeline.length + 1}-${ctx.now.getTime()}`,
    type,
    at: ctx.now.toISOString(),
    actorId: ctx.actor.id === 'system' ? null : ctx.actor.id,
    actorRoleAr: ctx.actorRoleAr,
    textAr,
    ...(noteAr ? { noteAr } : {}),
    ...(internal ? { internal: true } : {}),
  } satisfies TimelineEvent);
}

function notify(
  out: Out,
  ctx: EngineContext,
  userIds: readonly string[],
  kind: NotificationKind,
  titleAr: string,
  bodyAr: string,
  channels: Channel[] = ['sms', 'whatsapp'],
): void {
  for (const userId of new Set(userIds)) {
    if (userId === ctx.actor.id) continue;
    out.notifications.push({ userId, kind, titleAr, bodyAr, channels });
  }
}

const setStatus = (r: ServiceRequest, status: RequestStatus): void => {
  r.status = status;
};

function startSla(r: ServiceRequest, ctx: EngineContext): void {
  if (!r.sla.startedAt) {
    r.sla.startedAt = ctx.now.toISOString();
    r.sla.targetHours = ctx.slaHours[r.priority];
  }
}

/** After review/approval: either wait for the next approver or route to the executor. */
function advance(r: ServiceRequest, ctx: EngineContext, out: Out): void {
  const step = currentStep(r);
  const wf = WORKFLOWS[r.service];
  if (step) {
    setStatus(r, 'pending_approval');
    addEvent(r, ctx, 'status', `بانتظار اعتماد: ${step.labelAr}`);
    notify(
      out,
      ctx,
      ctx.usersWith(step.permissionKey, resourceOf(r)),
      'approval',
      'طلب بانتظار اعتمادك',
      `${r.refNo} — ${r.titleAr}`,
      ['whatsapp', 'email'],
    );
    return;
  }
  setStatus(r, 'approved');
  const auto = r.approvals.length === 0;
  addEvent(
    r,
    ctx,
    'routed',
    `${auto ? 'اعتماد تلقائي — ' : 'اكتمل الاعتماد — '}تم توجيه الطلب تلقائيًا إلى ${wf.executorLabelAr} وبدأ احتساب مدة الاستجابة`,
  );
  startSla(r, ctx);
  notify(out, ctx, [r.requesterId], 'status', 'تم استلام طلبك', `${r.refNo} — تم توجيهه إلى ${wf.executorLabelAr}.`);
  notify(
    out,
    ctx,
    ctx.usersWith('request.assign', resourceOf(r)),
    'assignment',
    'طلب جديد بانتظار الإسناد',
    `${r.refNo} — ${r.titleAr}`,
    ['whatsapp'],
  );
}

// ---------------------------------------------------------------------------------------------
// rules (single source for permission, state preconditions, effects, and UI descriptors)

interface Rule {
  labelAr: string;
  icon: string;
  tone: ActionTone;
  dialog: ActionDialog;
  noteRequired?: boolean;
  /** Used from dedicated forms, not offered in the action bar. */
  hidden?: boolean;
  /** Could this user ever perform the action on this request (permission/role only)? */
  holds: (r: ServiceRequest, ctx: EngineContext) => boolean;
  /** `null` if the request state allows it now, otherwise the Arabic reason. */
  blocked: (r: ServiceRequest, ctx: EngineContext) => string | null;
  validate?: (payload: ActionPayload, r: ServiceRequest) => void;
  apply: (r: ServiceRequest, ctx: EngineContext, payload: ActionPayload, out: Out) => void;
}

const SELF_COMPLETING: readonly ServiceKey[] = ['purchase-request', 'warehouse-need'];

const inStatus =
  (allowed: readonly RequestStatus[], reasonAr: string) =>
  (r: ServiceRequest): string | null =>
    allowed.includes(r.status) ? null : reasonAr;

const requireNote = (payload: ActionPayload, messageAr: string): string => {
  const note = payload.noteAr?.trim();
  if (!note) throw new WorkflowError(messageAr);
  return note;
};

const canApproveCurrent = (r: ServiceRequest, ctx: EngineContext): boolean => {
  const step = currentStep(r);
  return !!step && ctx.can(step.permissionKey, resourceOf(r));
};

const canApproveAny = (r: ServiceRequest, ctx: EngineContext): boolean =>
  r.approvals.some((s) => ctx.can(s.permissionKey, resourceOf(r)));

const lineNames = (lines: readonly IssueLine[]): string => lines.map((l) => `${l.nameAr} × ${l.qty}`).join('، ');

/** Puts a request on hold while it waits for supply (parts / procurement) and pauses its SLA. */
function holdForSupply(r: ServiceRequest, ctx: EngineContext, out: Out, reason: HoldReason, noteAr: string): void {
  setStatus(r, 'on_hold');
  r.holdReason = reason;
  r.statusNoteAr = noteAr;
  r.sla.pausedSince = ctx.now.toISOString();
  addEvent(r, ctx, 'status', `تم تعليق الطلب: ${HOLD_REASON_LABELS[reason]}`, noteAr);
  notify(out, ctx, [r.requesterId], 'status', 'تم تعليق طلبك مؤقتًا', `${r.refNo} — ${HOLD_REASON_LABELS[reason]}`);
}

/** Starts the request on the acting executor when it was only approved (first action of the executor). */
function takeOver(r: ServiceRequest, ctx: EngineContext): void {
  if (r.status === 'approved') {
    r.assigneeId = ctx.actor.id;
    r.assigneeName = ctx.actor.nameAr;
    setStatus(r, 'in_progress');
    startSla(r, ctx);
  }
}

const procurementOf = (r: ServiceRequest): ProcurementData => (r.details[PROCUREMENT_KEY] as ProcurementData | undefined) ?? {};
export const MIN_QUOTES = 3;

/** Purchases above the department limit need a comparison of MIN_QUOTES quotes with one selected before the PO. */
export const quotesRequired = (r: Pick<ServiceRequest, 'estimatedValue'>, limits: ApprovalLimits): boolean => r.estimatedValue > limits.departmentMax;

export function quotesReady(r: ServiceRequest): boolean {
  const p = procurementOf(r);
  return (p.quotes?.length ?? 0) >= MIN_QUOTES && !!p.selectedQuoteId;
}

export const RULES: Readonly<Record<ActionKey, Rule>> = {
  start_review: {
    labelAr: 'بدء المراجعة',
    icon: 'bi-search',
    tone: 'primary',
    dialog: 'none',
    holds: (r, ctx) => WORKFLOWS[r.service].reviewRequired && ctx.can('request.review', resourceOf(r)),
    blocked: inStatus(['new'], 'المراجعة تبدأ للطلبات الجديدة فقط'),
    apply: (r, ctx, _p, out) => {
      setStatus(r, 'under_review');
      addEvent(r, ctx, 'status', `بدأ ${ctx.actor.nameAr} مراجعة الطلب`);
      notify(out, ctx, [r.requesterId], 'status', 'طلبك قيد المراجعة', `${r.refNo} — ${r.titleAr}`);
    },
  },
  review_pass: {
    labelAr: 'استيفاء البيانات',
    icon: 'bi-check2-square',
    tone: 'success',
    dialog: 'none',
    holds: (r, ctx) => WORKFLOWS[r.service].reviewRequired && ctx.can('request.review', resourceOf(r)),
    blocked: inStatus(['under_review'], 'ابدأ المراجعة أولًا'),
    apply: (r, ctx, _p, out) => {
      addEvent(r, ctx, 'status', `اكتملت مراجعة الطلب بواسطة ${ctx.actor.nameAr}`);
      advance(r, ctx, out);
    },
  },
  approve: {
    labelAr: 'اعتماد',
    icon: 'bi-patch-check',
    tone: 'success',
    dialog: 'note',
    holds: (r, ctx) => canApproveAny(r, ctx),
    blocked: (r, ctx) => {
      if (r.status !== 'pending_approval') return 'الطلب ليس في مرحلة الاعتماد';
      const step = currentStep(r);
      if (!step) return 'لا توجد خطوة اعتماد معلّقة';
      if (isRequester(r, ctx)) return 'لا يمكنك اعتماد طلبك بنفسك';
      if (r.details['waitlisted'] === true) return 'الحجز في قائمة الانتظار — يُعتمد من شاشة النقل عند توفر باص';
      return ctx.can(step.permissionKey, resourceOf(r)) ? null : `بانتظار ${step.labelAr}`;
    },
    apply: (r, ctx, payload, out) => {
      const step = currentStep(r)!;
      step.state = 'approved';
      step.actorId = ctx.actor.id;
      step.at = ctx.now.toISOString();
      if (payload.noteAr?.trim()) step.noteAr = payload.noteAr.trim();
      addEvent(r, ctx, 'approved', `${step.labelAr}: ${ctx.actor.nameAr}`, payload.noteAr?.trim());
      advance(r, ctx, out);
    },
  },
  reject: {
    labelAr: 'رفض',
    icon: 'bi-x-octagon',
    tone: 'danger',
    dialog: 'note',
    noteRequired: true,
    holds: (r, ctx) => ctx.can('request.reject', resourceOf(r)) || canApproveAny(r, ctx),
    blocked: (r, ctx) => {
      if (!(['new', 'under_review', 'pending_approval', 'approved'] as RequestStatus[]).includes(r.status)) {
        return 'لا يمكن رفض الطلب في حالته الحالية';
      }
      if (isRequester(r, ctx)) return 'لا يمكنك رفض طلبك، يمكنك إلغاؤه';
      const allowed = ctx.can('request.reject', resourceOf(r)) || (r.status === 'pending_approval' && canApproveCurrent(r, ctx));
      return allowed ? null : 'ليس دورك في هذه المرحلة';
    },
    validate: (p) => void requireNote(p, 'سبب الرفض مطلوب'),
    apply: (r, ctx, payload, out) => {
      const note = payload.noteAr!.trim();
      const step = r.status === 'pending_approval' ? currentStep(r) : undefined;
      if (step) {
        step.state = 'rejected';
        step.actorId = ctx.actor.id;
        step.at = ctx.now.toISOString();
        step.noteAr = note;
      }
      setStatus(r, 'rejected');
      r.statusNoteAr = note;
      addEvent(r, ctx, 'rejected', `رفض ${ctx.actor.nameAr} الطلب`, note);
      notify(out, ctx, [r.requesterId], 'status', 'تم رفض طلبك', `${r.refNo} — السبب: ${note}`, ['sms', 'whatsapp', 'email']);
    },
  },
  return: {
    labelAr: 'إعادة للاستكمال',
    icon: 'bi-arrow-return-right',
    tone: 'warning',
    dialog: 'note',
    noteRequired: true,
    holds: (r, ctx) => ctx.can('request.review', resourceOf(r)) || canApproveAny(r, ctx),
    blocked: (r, ctx) => {
      if (!(['new', 'under_review', 'pending_approval'] as RequestStatus[]).includes(r.status)) {
        return 'لا يمكن إعادة الطلب في حالته الحالية';
      }
      if (isRequester(r, ctx)) return 'لا يمكنك إعادة طلبك';
      const allowed =
        ctx.can('request.review', resourceOf(r)) || (r.status === 'pending_approval' && canApproveCurrent(r, ctx));
      return allowed ? null : 'ليس دورك في هذه المرحلة';
    },
    validate: (p) => void requireNote(p, 'اذكر المطلوب استكماله'),
    apply: (r, ctx, payload, out) => {
      const note = payload.noteAr!.trim();
      const step = r.status === 'pending_approval' ? currentStep(r) : undefined;
      if (step) step.state = 'returned';
      setStatus(r, 'returned');
      r.statusNoteAr = note;
      addEvent(r, ctx, 'returned', `أعاد ${ctx.actor.nameAr} الطلب للاستكمال`, note);
      notify(out, ctx, [r.requesterId], 'status', 'طلبك يحتاج استكمالًا', `${r.refNo} — ${note}`, ['sms', 'whatsapp', 'email']);
    },
  },
  resubmit: {
    labelAr: 'إعادة الإرسال بعد الاستكمال',
    icon: 'bi-send',
    tone: 'primary',
    dialog: 'note',
    holds: (r, ctx) => isRequester(r, ctx),
    blocked: inStatus(['returned'], 'الطلب ليس مُعادًا للاستكمال'),
    apply: (r, ctx, payload, out) => {
      r.statusNoteAr = undefined;
      r.approvals = recomputeChain(
        { ...r, approvals: r.approvals.map((s) => (s.state === 'returned' ? { ...s, state: 'pending' as const } : s)) },
        ctx.limits,
      );
      addEvent(r, ctx, 'status', 'أعاد مقدم الطلب إرسال الطلب بعد الاستكمال', payload.noteAr?.trim());
      if (WORKFLOWS[r.service].reviewRequired) {
        setStatus(r, 'new');
        notify(out, ctx, ctx.usersWith('request.review', resourceOf(r)), 'status', 'طلب مُعاد بعد الاستكمال', `${r.refNo} — ${r.titleAr}`, ['whatsapp']);
      } else {
        advance(r, ctx, out);
      }
    },
  },
  cancel: {
    labelAr: 'إلغاء الطلب',
    icon: 'bi-slash-circle',
    tone: 'secondary',
    dialog: 'note',
    holds: (r, ctx) => isRequester(r, ctx) && ctx.can('request.cancel.own', resourceOf(r)),
    blocked: (r, ctx) => {
      const bus = r.service === 'bus-booking';
      const open: RequestStatus[] = ['new', 'under_review', 'pending_approval', 'returned'];
      if (bus) open.push('approved', 'in_progress');
      if (!open.includes(r.status)) return bus ? 'لا يمكن إلغاء الحجز بعد تنفيذ الرحلة' : 'لا يمكن إلغاء الطلب بعد اعتماده';
      return bus ? cancellationBlock(r.details['tripDate'], ctx.now) : null;
    },
    apply: (r, ctx, payload) => {
      setStatus(r, 'cancelled');
      r.statusNoteAr = payload.noteAr?.trim();
      addEvent(r, ctx, 'cancelled', 'ألغى مقدم الطلب الطلب', payload.noteAr?.trim());
    },
  },
  assign: {
    labelAr: 'إسناد',
    icon: 'bi-person-gear',
    tone: 'primary',
    dialog: 'assign',
    // Bus bookings are allocated (bus + driver) instead of assigned to a person.
    holds: (r, ctx) => r.service !== 'bus-booking' && ctx.can('request.assign', resourceOf(r)),
    blocked: inStatus(['approved', 'in_progress'], 'لا يمكن الإسناد قبل اعتماد الطلب'),
    validate: (p) => {
      if (!p.assigneeId || !p.assigneeName) throw new WorkflowError('اختر المنفّذ المسؤول');
    },
    apply: (r, ctx, payload, out) => {
      const reassign = r.status === 'in_progress';
      r.assigneeId = payload.assigneeId;
      r.assigneeName = payload.assigneeName;
      setStatus(r, 'in_progress');
      startSla(r, ctx);
      addEvent(
        r,
        ctx,
        'assigned',
        `${reassign ? 'أُعيد إسناد' : 'أسند'} ${ctx.actor.nameAr} الطلب إلى ${payload.assigneeName}`,
        payload.noteAr?.trim(),
      );
      notify(out, ctx, [r.requesterId], 'assignment', 'تم إسناد طلبك', `${r.refNo} — المسؤول: ${payload.assigneeName}`);
      notify(out, ctx, [payload.assigneeId!], 'assignment', 'أُسند إليك طلب', `${r.refNo} — ${r.titleAr}`, ['whatsapp']);
    },
  },
  start: {
    labelAr: 'بدء التنفيذ',
    icon: 'bi-play-circle',
    tone: 'primary',
    dialog: 'none',
    holds: (r, ctx) => ctx.can('request.execute', resourceOf(r)) && !ctx.can('request.assign', resourceOf(r)),
    blocked: inStatus(['approved'], 'لا يمكن البدء قبل اعتماد الطلب'),
    apply: (r, ctx, _p, out) => {
      r.assigneeId = ctx.actor.id;
      r.assigneeName = ctx.actor.nameAr;
      setStatus(r, 'in_progress');
      startSla(r, ctx);
      addEvent(r, ctx, 'assigned', `بدأ ${ctx.actor.nameAr} تنفيذ الطلب`);
      notify(out, ctx, [r.requesterId], 'assignment', 'بدأ تنفيذ طلبك', `${r.refNo} — المسؤول: ${ctx.actor.nameAr}`);
    },
  },
  hold: {
    labelAr: 'تعليق',
    icon: 'bi-pause-circle',
    tone: 'warning',
    dialog: 'hold',
    holds: (r, ctx) => ctx.can('request.execute', resourceOf(r)),
    blocked: inStatus(['in_progress'], 'التعليق متاح أثناء التنفيذ فقط'),
    validate: (p) => {
      if (!p.holdReason) throw new WorkflowError('اختر سبب التعليق');
      if (p.holdReason === 'requester_info') requireNote(p, 'اذكر المعلومات المطلوبة من مقدم الطلب');
    },
    apply: (r, ctx, payload, out) => {
      setStatus(r, 'on_hold');
      r.holdReason = payload.holdReason;
      r.statusNoteAr = payload.noteAr?.trim();
      r.sla.pausedSince = ctx.now.toISOString();
      const reason = HOLD_REASON_LABELS[payload.holdReason!];
      addEvent(r, ctx, 'status', `تم تعليق الطلب: ${reason}`, payload.noteAr?.trim());
      notify(out, ctx, [r.requesterId], 'status', 'تم تعليق طلبك مؤقتًا', `${r.refNo} — ${reason}`);
    },
  },
  resume: {
    labelAr: 'استئناف التنفيذ',
    icon: 'bi-play-circle',
    tone: 'primary',
    dialog: 'none',
    holds: (r, ctx) => ctx.can('request.execute', resourceOf(r)),
    blocked: inStatus(['on_hold'], 'الطلب ليس معلّقًا'),
    apply: (r, ctx, _p, out) => {
      if (r.sla.pausedSince) {
        r.sla.pausedMs += ctx.now.getTime() - new Date(r.sla.pausedSince).getTime();
        r.sla.pausedSince = undefined;
      }
      setStatus(r, 'in_progress');
      r.holdReason = undefined;
      r.statusNoteAr = undefined;
      addEvent(r, ctx, 'status', 'عاد الطلب إلى قيد التنفيذ');
      notify(out, ctx, [r.requesterId], 'status', 'استؤنف تنفيذ طلبك', `${r.refNo} — ${r.titleAr}`);
    },
  },
  complete: {
    labelAr: 'تم التنفيذ',
    icon: 'bi-check2-circle',
    tone: 'success',
    dialog: 'note',
    // Purchases finish with the goods receipt and warehouse needs with the issue.
    holds: (r, ctx) => !SELF_COMPLETING.includes(r.service) && ctx.can('request.execute', resourceOf(r)),
    blocked: inStatus(['in_progress'], 'يمكن إنهاء التنفيذ أثناء العمل فقط'),
    apply: (r, ctx, payload, out) => {
      const wf = WORKFLOWS[r.service];
      r.sla.stoppedAt = ctx.now.toISOString();
      addEvent(r, ctx, 'status', `أنهى ${ctx.actor.nameAr} العمل وسجّل النتيجة`, payload.noteAr?.trim());
      if (wf.confirmRequired) {
        setStatus(r, 'pending_confirmation');
        addEvent(r, ctx, 'status', 'بانتظار تأكيد مقدم الطلب');
        notify(out, ctx, [r.requesterId], 'status', 'أكّد استلام الخدمة', `${r.refNo} — تم التنفيذ، يرجى تأكيد النتيجة وتقييم الخدمة.`, ['sms', 'whatsapp', 'email']);
      } else {
        setStatus(r, 'executed');
        notify(out, ctx, [r.requesterId], 'status', 'تم تنفيذ طلبك', `${r.refNo} — ${r.titleAr}`);
      }
    },
  },
  confirm: {
    labelAr: 'تأكيد النتيجة',
    icon: 'bi-person-check',
    tone: 'success',
    dialog: 'confirm',
    holds: (r, ctx) => isRequester(r, ctx) && ctx.can('request.confirm', resourceOf(r)),
    blocked: inStatus(['pending_confirmation'], 'لا يوجد ما يستوجب التأكيد حاليًا'),
    validate: (p) => {
      if (!p.outcome || p.outcome === 'rejected') throw new WorkflowError('اختر نتيجة التأكيد');
      if (p.outcome === 'accepted_with_note') requireNote(p, 'اكتب ملاحظتك');
    },
    apply: (r, ctx, payload, out) => {
      r.confirmation = { outcome: payload.outcome!, noteAr: payload.noteAr?.trim(), at: ctx.now.toISOString() };
      if (payload.rating && ctx.can('request.rate', resourceOf(r))) {
        r.rating = { ...payload.rating, at: ctx.now.toISOString() };
        addEvent(r, ctx, 'rated', `قيّم مقدم الطلب الخدمة: ${payload.rating.stars} من 5`, payload.rating.noteAr?.trim());
      }
      setStatus(r, 'closed');
      addEvent(
        r,
        ctx,
        'confirmed',
        payload.outcome === 'accepted' ? 'أكد مقدم الطلب النتيجة — تم إغلاق الطلب' : 'قبل مقدم الطلب النتيجة مع ملاحظة — تم إغلاق الطلب',
        payload.noteAr?.trim(),
      );
      notify(out, ctx, r.assigneeId ? [r.assigneeId] : [], 'status', 'أُغلق الطلب بتأكيد مقدمه', `${r.refNo} — ${r.titleAr}`);
    },
  },
  reject_result: {
    labelAr: 'رفض النتيجة',
    icon: 'bi-hand-thumbs-down',
    tone: 'danger',
    dialog: 'note',
    noteRequired: true,
    holds: (r, ctx) => isRequester(r, ctx) && ctx.can('request.confirm', resourceOf(r)),
    blocked: inStatus(['pending_confirmation'], 'لا يوجد ما يستوجب التأكيد حاليًا'),
    validate: (p) => void requireNote(p, 'اذكر سبب رفض النتيجة'),
    apply: (r, ctx, payload, out) => {
      const note = payload.noteAr!.trim();
      r.confirmation = { outcome: 'rejected', noteAr: note, at: ctx.now.toISOString() };
      if (r.sla.stoppedAt) {
        r.sla.pausedMs += ctx.now.getTime() - new Date(r.sla.stoppedAt).getTime();
        r.sla.stoppedAt = undefined;
      }
      setStatus(r, 'in_progress');
      addEvent(r, ctx, 'returned', 'رفض مقدم الطلب النتيجة وأُعيد الطلب للتنفيذ', note);
      notify(out, ctx, r.assigneeId ? [r.assigneeId] : [], 'status', 'رُفضت نتيجة التنفيذ', `${r.refNo} — ${note}`, ['whatsapp']);
    },
  },
  close: {
    labelAr: 'إغلاق الطلب',
    icon: 'bi-lock',
    tone: 'success',
    dialog: 'note',
    holds: (r, ctx) => ctx.can('request.close', resourceOf(r)),
    blocked: inStatus(['executed'], 'يُغلق الطلب بعد تنفيذه'),
    apply: (r, ctx, payload, out) => {
      setStatus(r, 'closed');
      addEvent(r, ctx, 'status', `أغلق ${ctx.actor.nameAr} الطلب`, payload.noteAr?.trim());
      notify(out, ctx, [r.requesterId], 'status', 'تم إغلاق طلبك', `${r.refNo} — ${r.titleAr}`);
    },
  },
  rate: {
    labelAr: 'تقييم الخدمة',
    icon: 'bi-star',
    tone: 'info',
    dialog: 'rate',
    holds: (r, ctx) => isRequester(r, ctx) && ctx.can('request.rate', resourceOf(r)),
    blocked: (r) => (r.status !== 'closed' ? 'التقييم بعد إغلاق الطلب' : r.rating ? 'تم تقييم الخدمة مسبقًا' : null),
    validate: (p) => {
      if (!p.rating) throw new WorkflowError('اختر عدد النجوم');
    },
    apply: (r, ctx, payload) => {
      r.rating = { ...payload.rating!, at: ctx.now.toISOString() };
      addEvent(r, ctx, 'rated', `قيّم مقدم الطلب الخدمة: ${payload.rating!.stars} من 5`, payload.rating!.noteAr?.trim());
    },
  },
  escalate: {
    labelAr: 'تصعيد',
    icon: 'bi-arrow-up-circle',
    tone: 'danger',
    dialog: 'note',
    holds: (r, ctx) => ctx.can('request.escalate', resourceOf(r)),
    blocked: (r) => (isTerminal(r.status) ? 'الطلب مغلق' : r.sla.escalated ? 'تم تصعيد الطلب مسبقًا' : null),
    apply: (r, ctx, payload, out) => {
      escalate(r, ctx, out, payload.noteAr?.trim());
    },
  },
  add_cost: {
    labelAr: 'تسجيل تكلفة',
    icon: 'bi-cash-coin',
    tone: 'secondary',
    dialog: 'cost',
    holds: (r, ctx) => ctx.can('request.execute', resourceOf(r)),
    blocked: inStatus(['in_progress', 'on_hold'], 'تُسجَّل التكلفة أثناء التنفيذ'),
    validate: (p) => {
      const c = p.cost;
      if (!c || !c.descriptionAr.trim() || !(c.quantity > 0) || !(c.unitCost >= 0)) {
        throw new WorkflowError('أكمل بيانات بند التكلفة');
      }
    },
    apply: (r, ctx, payload) => {
      const cost = payload.cost!;
      r.costs.push({ ...cost, id: `c-${r.costs.length + 1}` });
      addEvent(r, ctx, 'status', `سُجّلت تكلفة: ${cost.descriptionAr} (${cost.quantity} × ${cost.unitCost} ر.س)`);
    },
  },
  save_execution: {
    labelAr: 'حفظ بيانات التنفيذ',
    icon: 'bi-clipboard2-pulse',
    tone: 'primary',
    dialog: 'none',
    hidden: true,
    holds: (r, ctx) => (r.service === 'building-maintenance' || r.service === 'vehicle-maintenance') && ctx.can('request.execute', resourceOf(r)),
    blocked: inStatus(['approved', 'in_progress', 'on_hold'], 'لا يمكن تعديل بيانات التنفيذ في هذه الحالة'),
    validate: (p) => {
      const e = p.execution;
      if (!e) throw new WorkflowError('بيانات التنفيذ مطلوبة');
      if (e.inspection && (!e.inspection.result.trim() || !e.inspection.rootCause.trim() || !e.inspection.repairPlan.trim())) {
        throw new WorkflowError('أكمل نتيجة الفحص والسبب الجذري وخطة الإصلاح');
      }
      if (e.startAt && e.endAt && new Date(e.endAt) < new Date(e.startAt)) throw new WorkflowError('نهاية العمل قبل بدايته');
      if (e.parts.some((x) => !x.description.trim() || !(x.qty > 0) || x.cost < 0)) throw new WorkflowError('أكمل بيانات جدول قطع الغيار');
    },
    apply: (r, ctx, payload, out) => {
      const next = payload.execution!;
      const previous = r.details[EXECUTION_KEY] as ExecutionData | undefined;
      r.details[EXECUTION_KEY] = next;

      // Generated cost lines (id `x-...`) mirror the parts table and the recorded labour hours.
      r.costs = r.costs.filter((c) => !c.id.startsWith('x-'));
      next.parts.forEach((p, i) =>
        r.costs.push({ id: `x-p${i + 1}`, kind: 'part', descriptionAr: p.description, quantity: p.qty, unitCost: p.cost }),
      );
      if (next.labourHours && next.labourHours > 0) {
        r.costs.push({ id: 'x-l', kind: 'labour', descriptionAr: 'ساعات عمل', quantity: next.labourHours, unitCost: LABOUR_RATE });
      }

      if (next.inspection && !previous?.inspection) {
        addEvent(r, ctx, 'inspection', `سجّل ${ctx.actor.nameAr} نتيجة الفحص والتشخيص`, next.inspection.result.trim(), true);
        if (next.inspection.needsParts) {
          addEvent(r, ctx, 'part_requested', 'يحتاج الطلب إلى قطع غيار — يُفحص رصيد المستودع');
          notify(out, ctx, [r.requesterId], 'status', 'تم فحص طلبك', `${r.refNo} — يحتاج الإصلاح إلى قطع غيار.`);
        }
      } else {
        addEvent(r, ctx, 'status', `حدّث ${ctx.actor.nameAr} بيانات التنفيذ`, undefined, true);
      }
    },
  },
  record_closure: {
    labelAr: 'تسجيل قرار الإغلاق',
    icon: 'bi-flag',
    tone: 'primary',
    dialog: 'none',
    hidden: true,
    holds: (r, ctx) => (r.service === 'building-maintenance' || r.service === 'vehicle-maintenance') && ctx.can('request.close', resourceOf(r)),
    blocked: (r) => {
      if (!(['pending_confirmation', 'executed', 'closed'] as RequestStatus[]).includes(r.status)) return 'يُسجَّل القرار بعد انتهاء التنفيذ';
      return r.details[CLOSURE_KEY] ? 'تم تسجيل قرار الإغلاق مسبقًا' : null;
    },
    validate: (p) => {
      if (!p.closure?.decision || !p.closure.assetCondition) throw new WorkflowError('اختر القرار وحالة الأصل');
    },
    apply: (r, ctx, payload) => {
      const closure: ClosureData = { ...payload.closure!, at: ctx.now.toISOString() };
      r.details[CLOSURE_KEY] = closure;
      addEvent(r, ctx, 'status', 'سُجّل قرار مسؤول الصيانة بعد التنفيذ', undefined, true);
    },
  },
  allocate: {
    labelAr: 'تخصيص باص وسائق',
    icon: 'bi-bus-front',
    tone: 'primary',
    dialog: 'allocate',
    holds: (r, ctx) => r.service === 'bus-booking' && ctx.can('transport.allocate', resourceOf(r)),
    blocked: inStatus(['approved', 'in_progress'], 'يُخصَّص الباص بعد اعتماد الحجز'),
    validate: (p, r) => {
      const slots = p.allocation?.slots ?? [];
      const buses = Number(r.details['buses'] ?? 1);
      if (slots.length !== buses) throw new WorkflowError(`يتطلب هذا الحجز ${buses} باصات — أكمل التخصيص.`);
      const fleet = slots.filter((s) => s.vehicleId);
      if (fleet.some((s) => !s.driverId)) throw new WorkflowError('اختر سائقًا لكل باص من أسطول المدارس.');
      if (new Set(fleet.map((s) => s.vehicleId)).size !== fleet.length) throw new WorkflowError('لا يمكن تخصيص الباص نفسه أكثر من مرة.');
      const drivers = fleet.map((s) => s.driverId);
      if (new Set(drivers).size !== drivers.length) throw new WorkflowError('لا يمكن تخصيص السائق نفسه لأكثر من باص.');
    },
    apply: (r, ctx, payload, out) => {
      const reassign = r.status === 'in_progress';
      const allocation: BusAllocation = { slots: payload.allocation!.slots, byName: ctx.actor.nameAr, at: ctx.now.toISOString() };
      r.details['allocation'] = allocation;
      r.assigneeId = ctx.actor.id;
      r.assigneeName = ctx.actor.nameAr;
      setStatus(r, 'in_progress');
      startSla(r, ctx);
      const contracted = allocation.slots.filter((s) => !s.vehicleId).length;
      addEvent(
        r,
        ctx,
        'assigned',
        `${reassign ? 'عدّل' : 'خصّص'} ${ctx.actor.nameAr} ${allocation.slots.length} باص/باصات وسائقيها${contracted ? ` (منها ${contracted} متعاقد)` : ''}`,
      );
      notify(out, ctx, [r.requesterId], 'assignment', 'تم تخصيص باص لرحلتك', `${r.refNo} — ${r.titleAr}`);
    },
  },
  promote: {
    labelAr: 'اعتماد من قائمة الانتظار',
    icon: 'bi-box-arrow-in-up',
    tone: 'success',
    dialog: 'note',
    hidden: true,
    holds: (r, ctx) => r.service === 'bus-booking' && ctx.can('transport.calendar.manage', resourceOf(r)),
    blocked: (r) => (r.status === 'pending_approval' && r.details['waitlisted'] === true ? null : 'الحجز ليس في قائمة الانتظار'),
    apply: (r, ctx, payload, out) => {
      r.details['waitlisted'] = false;
      addEvent(r, ctx, 'system', 'توفر باص — نُقل الحجز من قائمة الانتظار إلى الحجوزات المعتمدة', payload.noteAr?.trim());
      RULES.approve.apply(r, ctx, payload, out);
    },
  },
  request_parts: {
    labelAr: 'فحص المستودع وطلب القطع',
    icon: 'bi-box-seam',
    tone: 'primary',
    dialog: 'none',
    hidden: true,
    holds: (r, ctx) => (r.service === 'building-maintenance' || r.service === 'vehicle-maintenance') && ctx.can('request.execute', resourceOf(r)),
    blocked: inStatus(['in_progress'], 'ابدأ التنفيذ أولًا ثم افحص المستودع'),
    validate: (p) => {
      if (!p.fulfilment || (!p.fulfilment.issued.length && !p.fulfilment.shortages.length)) throw new WorkflowError('أضف قطعة من المستودع إلى جدول القطع أولًا');
    },
    apply: (r, ctx, payload, out) => {
      const plan = payload.fulfilment!;
      const previous = (r.details[FULFILMENT_KEY] as Fulfilment | undefined) ?? { issued: [], awaiting: [] };
      const next: Fulfilment = { issued: [...previous.issued, ...plan.issued], awaiting: [...previous.awaiting, ...plan.shortages], purchaseRef: previous.purchaseRef };
      r.details[FULFILMENT_KEY] = next;
      if (plan.issued.length) {
        addEvent(r, ctx, 'part_issued', `صُرفت من المستودع: ${lineNames(plan.issued)}`);
        notify(out, ctx, [r.requesterId], 'status', 'تم صرف قطع لطلبك', `${r.refNo} — ${lineNames(plan.issued)}`);
      }
      if (plan.shortages.length) {
        addEvent(r, ctx, 'part_requested', `غير متوفر في المستودع: ${lineNames(plan.shortages)} — يُنشأ طلب شراء مرتبط`);
        holdForSupply(r, ctx, out, 'parts', `بانتظار توريد: ${lineNames(plan.shortages)}`);
      }
    },
  },
  issue_items: {
    labelAr: 'صرف من المستودع',
    icon: 'bi-box-arrow-up',
    tone: 'success',
    dialog: 'none',
    holds: (r, ctx) => r.service === 'warehouse-need' && ctx.can('warehouse.issue'),
    blocked: inStatus(['approved', 'in_progress'], 'يُصرف الطلب بعد اعتماده'),
    validate: (p) => {
      if (!p.fulfilment || (!p.fulfilment.issued.length && !p.fulfilment.shortages.length)) throw new WorkflowError('لا توجد أصناف للصرف');
    },
    apply: (r, ctx, payload, out) => {
      const plan = payload.fulfilment!;
      takeOver(r, ctx);
      r.details[FULFILMENT_KEY] = { issued: plan.issued, awaiting: plan.shortages } satisfies Fulfilment;
      r.costs = r.costs.filter((c) => !c.id.startsWith('s-'));
      plan.issued.forEach((l) => r.costs.push({ id: `s-${l.itemId}`, kind: 'part', descriptionAr: `${l.nameAr} (من المستودع)`, quantity: l.qty, unitCost: l.unitPrice }));
      if (plan.issued.length) addEvent(r, ctx, 'part_issued', `صرف ${ctx.actor.nameAr} من المستودع: ${lineNames(plan.issued)}`);
      if (plan.shortages.length) {
        addEvent(r, ctx, 'part_requested', `غير متوفر: ${lineNames(plan.shortages)} — يُنشأ طلب شراء مرتبط`);
        holdForSupply(r, ctx, out, 'procurement', `بانتظار توريد: ${lineNames(plan.shortages)}`);
        return;
      }
      finishNeed(r, ctx, out);
    },
  },
  save_quotes: {
    labelAr: 'حفظ عروض الأسعار',
    icon: 'bi-clipboard-data',
    tone: 'primary',
    dialog: 'none',
    hidden: true,
    holds: (r, ctx) => r.service === 'purchase-request' && ctx.can('purchasing.quote'),
    blocked: (r) => {
      if (!(['approved', 'in_progress'] as RequestStatus[]).includes(r.status)) return 'عروض الأسعار تُسجَّل بعد اعتماد الطلب';
      return procurementOf(r).po ? 'صدر أمر التوريد مسبقًا' : null;
    },
    validate: (p) => {
      const q = p.quotes?.quotes ?? [];
      if (!q.length || q.some((x) => !x.supplierId || !(x.amount > 0) || !(x.deliveryDays >= 0))) throw new WorkflowError('أكمل بيانات كل عرض: المورد والمبلغ ومدة التوريد');
      if (new Set(q.map((x) => x.supplierId)).size !== q.length) throw new WorkflowError('لا يمكن تكرار المورد نفسه في المقارنة');
      if (p.quotes?.selectedId && !q.some((x) => x.id === p.quotes!.selectedId)) throw new WorkflowError('العرض المختار غير موجود');
    },
    apply: (r, ctx, payload) => {
      takeOver(r, ctx);
      const data = procurementOf(r);
      r.details[PROCUREMENT_KEY] = { ...data, quotes: payload.quotes!.quotes, selectedQuoteId: payload.quotes!.selectedId } satisfies ProcurementData;
      const picked = payload.quotes!.quotes.find((q) => q.id === payload.quotes!.selectedId);
      addEvent(r, ctx, 'status', `سجّل ${ctx.actor.nameAr} ${payload.quotes!.quotes.length} عروض أسعار${picked ? ` واختار عرض ${picked.supplierName}` : ''}`, undefined, true);
    },
  },
  issue_po: {
    labelAr: 'إصدار أمر التوريد',
    icon: 'bi-file-earmark-text',
    tone: 'primary',
    dialog: 'none',
    hidden: true,
    holds: (r, ctx) => r.service === 'purchase-request' && ctx.can('purchasing.po'),
    blocked: (r, ctx) => {
      if (!(['approved', 'in_progress'] as RequestStatus[]).includes(r.status)) return 'يصدر أمر التوريد بعد اعتماد الطلب';
      if (procurementOf(r).po) return 'صدر أمر التوريد مسبقًا';
      if (quotesRequired(r, ctx.limits) && !quotesReady(r)) {
        return `المشتريات التي تتجاوز ${ctx.limits.departmentMax} ر.س تتطلب مقارنة ${MIN_QUOTES} عروض واختيار أحدها`;
      }
      return null;
    },
    validate: (p, r) => {
      const po = p.po;
      if (!po?.supplierId || !(po.amount > 0)) throw new WorkflowError('اختر المورد وأدخل مبلغ أمر التوريد');
      const data = procurementOf(r);
      const chosen = data.quotes?.find((q) => q.id === data.selectedQuoteId);
      if (chosen && chosen.supplierId !== po.supplierId) throw new WorkflowError('يجب إصدار أمر التوريد للمورد صاحب العرض المختار');
    },
    apply: (r, ctx, payload, out) => {
      takeOver(r, ctx);
      const data = procurementOf(r);
      const po = {
        no: `PO-${r.refNo.slice(4)}`,
        supplierId: payload.po!.supplierId,
        supplierName: payload.po!.supplierName,
        amount: payload.po!.amount,
        quoteId: data.selectedQuoteId,
        issuedAt: ctx.now.toISOString(),
        byName: ctx.actor.nameAr,
      };
      r.details[PROCUREMENT_KEY] = { ...data, po } satisfies ProcurementData;
      r.costs = r.costs.filter((c) => c.id !== 'po');
      r.costs.push({ id: 'po', kind: 'purchase', descriptionAr: `أمر توريد ${po.no} — ${po.supplierName}`, quantity: 1, unitCost: po.amount });
      addEvent(r, ctx, 'status', `أصدر ${ctx.actor.nameAr} أمر التوريد ${po.no} للمورد ${po.supplierName}`);
      notify(out, ctx, [r.requesterId], 'status', 'صدر أمر التوريد لطلبك', `${r.refNo} — ${po.supplierName}`);
    },
  },
  receive_goods: {
    labelAr: 'تسجيل الاستلام والعهدة',
    icon: 'bi-box2-heart',
    tone: 'success',
    dialog: 'none',
    hidden: true,
    holds: (r, ctx) => r.service === 'purchase-request' && (ctx.can('purchasing.receive') || ctx.can('warehouse.stockin')),
    blocked: (r) => {
      if (r.status !== 'in_progress') return 'الاستلام بعد إصدار أمر التوريد';
      const data = procurementOf(r);
      if (!data.po) return 'أصدر أمر التوريد أولًا';
      return data.receipt ? 'تم الاستلام مسبقًا' : null;
    },
    validate: (p) => {
      if (!p.receipt?.condition) throw new WorkflowError('حدد حالة الاستلام');
      if (p.receipt.custodyAck !== true) throw new WorkflowError('إقرار العهدة مطلوب لإتمام الاستلام');
      if (p.receipt.condition === 'with_notes' && !p.receipt.noteAr?.trim()) throw new WorkflowError('اذكر ملاحظات الاستلام');
    },
    apply: (r, ctx, payload, out) => {
      const data = procurementOf(r);
      r.details[PROCUREMENT_KEY] = {
        ...data,
        receipt: {
          receivedAt: ctx.now.toISOString(),
          receiverId: ctx.actor.id,
          receiverName: ctx.actor.nameAr,
          condition: payload.receipt!.condition,
          custodyAck: true,
          noteAr: payload.receipt!.noteAr?.trim() || undefined,
        },
      } satisfies ProcurementData;
      r.sla.stoppedAt = ctx.now.toISOString();
      addEvent(r, ctx, 'status', `استلم ${ctx.actor.nameAr} التوريد وأقرّ بالعهدة`, payload.receipt!.noteAr?.trim(), true);
      if (r.details[FOR_LINES_KEY]) {
        // Replenishment for another request: nobody needs to confirm, the parent request resumes by itself.
        setStatus(r, 'closed');
        addEvent(r, ctx, 'status', 'اكتمل الاستلام — أُغلق الطلب وأُضيفت الأصناف إلى المستودع');
      } else {
        setStatus(r, 'pending_confirmation');
        addEvent(r, ctx, 'status', 'بانتظار تأكيد مقدم الطلب');
        notify(out, ctx, [r.requesterId], 'status', 'أكّد استلام طلبك', `${r.refNo} — تم استلام التوريد، يرجى تأكيد الاستلام وتقييم الخدمة.`, ['sms', 'whatsapp', 'email']);
      }
    },
  },
};

/** A warehouse need whose lines were all issued is done: the requester confirms the receipt. */
function finishNeed(r: ServiceRequest, ctx: EngineContext, out: Out): void {
  r.sla.stoppedAt = ctx.now.toISOString();
  setStatus(r, 'pending_confirmation');
  addEvent(r, ctx, 'status', 'بانتظار تأكيد مقدم الطلب');
  notify(out, ctx, [r.requesterId], 'status', 'أكّد استلام الأصناف', `${r.refNo} — صُرفت أصنافك من المستودع، يرجى تأكيد الاستلام.`, ['sms', 'whatsapp', 'email']);
}

function escalate(r: ServiceRequest, ctx: EngineContext, out: Out, noteAr?: string): void {
  const wf = WORKFLOWS[r.service];
  r.sla.escalated = true;
  addEvent(r, ctx, 'escalated', `تم التصعيد إلى ${wf.escalateToLabelAr}`, noteAr);
  notify(
    out,
    ctx,
    ctx.roleUsers(wf.escalateToRoleId),
    'sla',
    'تصعيد طلب',
    `${r.refNo} — ${r.titleAr}`,
    ['sms', 'whatsapp', 'email'],
  );
}

// ---------------------------------------------------------------------------------------------
// public API

const auditOf = (r: ServiceRequest, actionAr: string, before: RequestStatus | null): AuditDraft => ({
  actionAr,
  entityType: 'request',
  summaryAr: `${r.refNo} — ${actionAr}`,
  before: before ? { status: before } : undefined,
  after: { status: r.status },
});

/** Validates the draft, builds the request, runs automatic routing. */
export function createRequest(draft: RequestDraft, ctx: EngineContext, seq: number, id: string): EngineResult {
  const def = SERVICE_BY_KEY[draft.service];
  if (!ctx.can(def.createPermission)) throw new WorkflowError('ليست لديك صلاحية تقديم هذا النوع من الطلبات.');
  if (!draft.titleAr.trim()) throw new WorkflowError('عنوان الطلب مطلوب.');
  if (!draft.descriptionAr.trim()) throw new WorkflowError('تفاصيل الطلب مطلوبة.');
  if (draft.service === 'traffic-accident' && draft.attachments.length === 0) {
    throw new WorkflowError('إرفاق تقرير نجم مطلوب لتسجيل الحادث.');
  }

  const wf = WORKFLOWS[draft.service];
  const now = ctx.now.toISOString();
  const request: ServiceRequest = {
    id,
    refNo: `MNH-${ctx.now.getFullYear()}-${String(seq).padStart(6, '0')}`,
    service: draft.service,
    titleAr: draft.titleAr.trim(),
    descriptionAr: draft.descriptionAr.trim(),
    requesterId: ctx.actor.id,
    requesterName: ctx.actor.nameAr,
    requesterMobile: draft.requesterMobile?.trim() || ctx.actor.mobile || '',
    branchId: draft.branchId,
    departmentId: draft.departmentId,
    priority: draft.priority,
    status: 'new',
    neededBy: draft.neededBy,
    estimatedValue: draft.estimatedValue,
    createdAt: now,
    updatedAt: now,
    details: draft.details,
    timeline: [],
    comments: [],
    attachments: draft.attachments,
    approvals: buildApprovalChain(
      { service: draft.service, priority: draft.priority, estimatedValue: draft.estimatedValue, details: draft.details },
      ctx.limits,
    ),
    costs: [],
    links: [],
    sla: {
      targetHours: ctx.slaHours[draft.priority],
      startedAt: null,
      pausedMs: 0,
      breached: false,
      escalated: false,
    },
    confidential: wf.confidential(draft.details),
  };

  const out: Out = { notifications: [] };
  addEvent(request, ctx, 'created', `قدّم ${ctx.actor.nameAr} الطلب (${def.nameAr})`);
  // The requester always receives the acknowledgement, even though they are the actor.
  out.notifications.push({
    userId: ctx.actor.id,
    kind: 'status',
    titleAr: 'تم استلام طلبك',
    bodyAr: `${request.refNo} — رقمك المرجعي للمتابعة`,
    channels: ['sms', 'whatsapp'],
  });

  if (wf.reviewRequired) {
    addEvent(request, ctx, 'routed', `تم توجيه الطلب تلقائيًا إلى ${wf.reviewerLabelAr} للمراجعة`);
    notify(
      out,
      ctx,
      ctx.usersWith('request.review', resourceOf(request)),
      'status',
      'طلب جديد بانتظار المراجعة',
      `${request.refNo} — ${request.titleAr}`,
      ['whatsapp'],
    );
  } else {
    advance(request, ctx, out);
  }

  return {
    request,
    notifications: out.notifications,
    audit: [auditOf(request, 'إنشاء طلب', null)],
  };
}

/** Applies one action. Throws `WorkflowError` if the user lacks permission or the state forbids it. */
export function perform(
  request: ServiceRequest,
  action: ActionKey,
  ctx: EngineContext,
  payload: ActionPayload = {},
): EngineResult {
  const rule = RULES[action];
  if (!rule.holds(request, ctx)) throw new WorkflowError('ليست لديك صلاحية لتنفيذ هذا الإجراء.');
  const blocked = rule.blocked(request, ctx);
  if (blocked) throw new WorkflowError(blocked);
  rule.validate?.(payload, request);

  const next = structuredClone(request);
  const out: Out = { notifications: [] };
  rule.apply(next, ctx, payload, out);
  next.updatedAt = ctx.now.toISOString();
  return { request: next, notifications: out.notifications, audit: [auditOf(next, rule.labelAr, request.status)] };
}

/** The actions to show for this user: hidden if never possible, disabled (with reason) if not possible now. */
export function describeActions(request: ServiceRequest, ctx: EngineContext): ActionDescriptor[] {
  const result: ActionDescriptor[] = [];
  for (const key of Object.keys(RULES) as ActionKey[]) {
    const rule = RULES[key];
    if (rule.hidden || !rule.holds(request, ctx)) continue;
    const blocked = rule.blocked(request, ctx);
    result.push({
      key,
      labelAr: rule.labelAr,
      icon: rule.icon,
      tone: rule.tone,
      dialog: rule.dialog,
      noteRequired: rule.noteRequired ?? false,
      enabled: blocked === null,
      ...(blocked ? { disabledReasonAr: blocked } : {}),
    });
  }
  return result;
}

/**
 * A complaint about a request shows up in that request's timeline (recorded by the system so the
 * complainer's identity is not exposed) and in its links, which feeds the executor's quality metrics.
 */
export function linkComplaint(target: ServiceRequest, complaint: ServiceRequest, ctx: EngineContext): ServiceRequest {
  const next = structuredClone(target);
  if (next.links.some((l) => l.requestId === complaint.id)) return next;
  const system: EngineContext = { ...ctx, actor: { id: 'system', nameAr: 'النظام' }, actorRoleAr: 'النظام' };
  next.links.push({ requestId: complaint.id, relation: 'complaint' });
  addEvent(next, system, 'complaint_linked', `رُبطت شكوى (${complaint.refNo}) بهذا الطلب`);
  next.updatedAt = ctx.now.toISOString();
  return next;
}

const systemOf = (ctx: EngineContext): EngineContext => ({ ...ctx, actor: { id: 'system', nameAr: 'النظام' }, actorRoleAr: 'النظام' });

/**
 * An approved event spawns its child requests (bus booking, venue preparation, materials) in the name of
 * the event's requester. The creator's permission is not needed: the checklist the requester ticked is the request.
 */
export function spawnChild(
  event: ServiceRequest,
  draft: RequestDraft,
  ctx: EngineContext,
  seq: number,
  id: string,
  onBehalfOf?: Actor,
): EngineResult {
  const requester: Actor = onBehalfOf ?? { id: event.requesterId, nameAr: event.requesterName, mobile: event.requesterMobile };
  const asRequester: EngineContext = {
    ...ctx,
    actor: requester,
    actorRoleAr: 'مقدم الطلب',
    can: (key, resource) => key.startsWith('request.create.') || ctx.can(key, resource),
  };
  const created = createRequest(draft, asRequester, seq, id);
  const child = created.request;
  if (event.service === 'internal-event') child.details['parentEventRef'] = event.refNo;
  child.links.push({ requestId: event.id, relation: 'parent' });
  addEvent(child, systemOf(ctx), 'linked_created', `أُنشئ تلقائيًا من ${event.service === 'internal-event' ? 'الفعالية' : 'الطلب'} ${event.refNo} — ${event.titleAr}`);
  return created;
}

/** Records the children spawned for an event on the event itself. */
export function attachChildren(event: ServiceRequest, children: readonly ServiceRequest[], ctx: EngineContext): ServiceRequest {
  const next = structuredClone(event);
  const system = systemOf(ctx);
  for (const child of children) {
    next.links.push({ requestId: child.id, relation: 'child' });
    addEvent(next, system, 'linked_created', `أُنشئ طلب مرتبط: ${SERVICE_BY_KEY[child.service].nameAr} (${child.refNo})`);
  }
  next.updatedAt = ctx.now.toISOString();
  return next;
}

const CHILD_DONE: readonly RequestStatus[] = ['closed', 'executed'];
const CHILD_DROPPED: readonly RequestStatus[] = ['cancelled', 'rejected'];

/** An approved event closes by itself once every child request is finished (cancelled/rejected ones do not block it). */
export function eventShouldClose(event: Pick<ServiceRequest, 'service' | 'status'>, childStatuses: readonly RequestStatus[]): boolean {
  if (event.service !== 'internal-event' || !(['approved', 'in_progress'] as RequestStatus[]).includes(event.status)) return false;
  return (
    childStatuses.length > 0 &&
    childStatuses.some((s) => CHILD_DONE.includes(s)) &&
    childStatuses.every((s) => CHILD_DONE.includes(s) || CHILD_DROPPED.includes(s))
  );
}

export function autoCloseEvent(event: ServiceRequest, ctx: EngineContext): EngineResult {
  const next = structuredClone(event);
  const system = systemOf(ctx);
  next.sla.stoppedAt = ctx.now.toISOString();
  setStatus(next, 'closed');
  addEvent(next, system, 'linked_completed', 'اكتملت جميع الطلبات المرتبطة — أُغلقت الفعالية تلقائيًا');
  next.updatedAt = ctx.now.toISOString();
  const out: Out = { notifications: [] };
  notify(out, system, [next.requesterId], 'status', 'اكتملت فعاليتك', `${next.refNo} — اكتملت جميع التجهيزات المرتبطة وأُغلقت الفعالية.`, ['sms', 'whatsapp']);
  return { request: next, notifications: out.notifications, audit: [auditOf(next, 'إغلاق تلقائي للفعالية', event.status)] };
}

/**
 * The purchase that replenished stock for `parent` was received: the missing lines were issued to the parent,
 * which leaves the supply hold by itself (maintenance returns to in-progress, a warehouse need is completed).
 */
export function resumeAfterReceipt(parent: ServiceRequest, ctx: EngineContext, purchaseRef: string, lines: readonly IssueLine[]): EngineResult | null {
  if (parent.status !== 'on_hold') return null;
  const next = structuredClone(parent);
  const system = systemOf(ctx);
  const out: Out = { notifications: [] };
  const fulfilment = (next.details[FULFILMENT_KEY] as Fulfilment | undefined) ?? { issued: [], awaiting: [] };
  next.details[FULFILMENT_KEY] = {
    issued: [...fulfilment.issued, ...lines],
    awaiting: fulfilment.awaiting.filter((a) => !lines.some((l) => l.itemId === a.itemId)),
    purchaseRef,
  } satisfies Fulfilment;

  if (next.sla.pausedSince) {
    next.sla.pausedMs += ctx.now.getTime() - new Date(next.sla.pausedSince).getTime();
    next.sla.pausedSince = undefined;
  }
  next.holdReason = undefined;
  next.statusNoteAr = undefined;
  addEvent(next, system, 'part_issued', `وصل التوريد (${purchaseRef}) وصُرف: ${lineNames(lines)}`);

  if (next.service === 'warehouse-need') {
    lines.forEach((l) => next.costs.push({ id: `s-${l.itemId}`, kind: 'part', descriptionAr: `${l.nameAr} (من المستودع)`, quantity: l.qty, unitCost: l.unitPrice }));
    finishNeed(next, system, out);
  } else {
    setStatus(next, 'in_progress');
    addEvent(next, system, 'linked_completed', 'اكتمل الطلب المرتبط — عاد الطلب إلى قيد التنفيذ تلقائيًا');
    notify(out, system, [next.requesterId, ...(next.assigneeId ? [next.assigneeId] : [])], 'status', 'عاد طلبك إلى قيد التنفيذ', `${next.refNo} — وصلت القطعة المطلوبة.`);
  }
  next.updatedAt = ctx.now.toISOString();
  return { request: next, notifications: out.notifications, audit: [auditOf(next, 'استئناف تلقائي بعد وصول التوريد', parent.status)] };
}

/** Public/internal comment. Internal comments need `request.comment.internal`. */
export function addComment(
  request: ServiceRequest,
  ctx: EngineContext,
  textAr: string,
  internal: boolean,
): EngineResult {
  const text = textAr.trim();
  if (!text) throw new WorkflowError('اكتب نص التعليق.');
  if (internal ? !ctx.can('request.comment.internal') : !ctx.can('request.comment.public')) {
    throw new WorkflowError('ليست لديك صلاحية إضافة هذا النوع من التعليقات.');
  }
  if (isTerminal(request.status) && request.status !== 'closed') throw new WorkflowError('لا يمكن التعليق على طلب منتهٍ.');

  const next = structuredClone(request);
  const out: Out = { notifications: [] };
  const comment: RequestComment = {
    id: `cm-${next.comments.length + 1}-${ctx.now.getTime()}`,
    authorId: ctx.actor.id,
    authorName: ctx.actor.nameAr,
    authorRoleAr: ctx.actorRoleAr,
    at: ctx.now.toISOString(),
    textAr: text,
    internal,
  };
  next.comments.push(comment);
  addEvent(next, ctx, 'comment', internal ? 'أضاف تعليقًا داخليًا' : 'أضاف تعليقًا ظاهرًا لمقدم الطلب', undefined, internal);
  if (!internal) {
    const recipients = [next.requesterId, ...(next.assigneeId ? [next.assigneeId] : [])];
    notify(out, ctx, recipients, 'comment', 'تعليق جديد على الطلب', `${next.refNo} — ${text.slice(0, 80)}`, ['whatsapp']);
  }
  next.updatedAt = ctx.now.toISOString();
  return { request: next, notifications: out.notifications, audit: [] };
}

const PRE_APPROVAL: readonly RequestStatus[] = ['new', 'under_review', 'pending_approval', 'returned'];

/**
 * The approval limits changed: rebuild the approval chain of a request that has not been approved yet.
 * Decided steps are kept, steps no longer required are skipped, and a request whose remaining steps are gone moves on.
 * Returns `null` when nothing changes.
 */
export function reapplyChain(request: ServiceRequest, ctx: EngineContext): EngineResult | null {
  if (!PRE_APPROVAL.includes(request.status)) return null;
  const signature = (steps: ServiceRequest['approvals']): string => steps.map((s) => `${s.permissionKey}:${s.state}`).join('|');
  const next = structuredClone(request);
  next.approvals = recomputeChain(next, ctx.limits);
  if (signature(next.approvals) === signature(request.approvals)) return null;

  const system = systemOf(ctx);
  const out: Out = { notifications: [] };
  addEvent(next, system, 'status', 'تغيّر مسار الاعتماد بعد تعديل الحدود المالية');
  if (request.status === 'pending_approval') advance(next, system, out);
  next.updatedAt = ctx.now.toISOString();
  return { request: next, notifications: out.notifications, audit: [auditOf(next, 'إعادة احتساب مسار الاعتماد', request.status)] };
}

/** The SLA hours changed: open requests take the new target for their priority. `null` when nothing changes. */
export function reapplySlaTarget(request: ServiceRequest, ctx: EngineContext): ServiceRequest | null {
  const target = ctx.slaHours[request.priority];
  if (isTerminal(request.status) || request.sla.targetHours === target) return null;
  const next = structuredClone(request);
  next.sla.targetHours = target;
  addEvent(next, systemOf(ctx), 'status', `عُدّلت مدة الاستجابة المستهدفة إلى ${target} ساعة`);
  next.updatedAt = ctx.now.toISOString();
  return next;
}

/** System sweep: marks an open request whose SLA ran out as breached and escalates it. Returns `null` if nothing changed. */
export function sweepSla(request: ServiceRequest, ctx: EngineContext): EngineResult | null {
  const { sla } = request;
  const running = sla.startedAt && !sla.stoppedAt && !sla.pausedSince && !isTerminal(request.status);
  if (!running || sla.breached || slaElapsedMs(sla, ctx.now) <= slaTargetMs(sla)) return null;

  const next = structuredClone(request);
  const out: Out = { notifications: [] };
  next.sla.breached = true;
  addEvent(next, ctx, 'sla_breach', 'تجاوز الطلب مدة الاستجابة المستهدفة');
  if (!next.sla.escalated) escalate(next, ctx, out);
  next.updatedAt = ctx.now.toISOString();
  return {
    request: next,
    notifications: out.notifications,
    audit: [{ actionAr: 'تصعيد تلقائي', entityType: 'request', summaryAr: `${next.refNo} — تجاوز مدة الاستجابة` }],
  };
}
