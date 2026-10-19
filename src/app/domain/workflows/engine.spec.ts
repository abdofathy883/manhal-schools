import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../models/platform';
import { RequestDraft, EngineContext, WorkflowError, createRequest, describeActions, perform, sweepSla } from './engine';
import { buildApprovalChain, recomputeChain } from './approval-chain';
import { slaElapsedMs } from './sla';
import { ServiceRequest } from '../models/request';

const T0 = new Date('2026-10-18T08:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

function ctxFor(
  id: string,
  permissions: string[],
  now: Date = T0,
  overrides: Partial<EngineContext> = {},
): EngineContext {
  return {
    actor: { id, nameAr: `مستخدم ${id}`, mobile: '0500000000' },
    actorRoleAr: 'اختبار',
    can: (key) => permissions.includes(key),
    now,
    limits: DEFAULT_SETTINGS.approvalLimits,
    slaHours: DEFAULT_SETTINGS.slaHours,
    usersWith: () => ['approver-1'],
    roleUsers: () => ['senior-1'],
    ...overrides,
  };
}

const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({
  service: 'building-maintenance',
  titleAr: 'عطل في التكييف',
  descriptionAr: 'المكيف لا يبرد',
  priority: 'urgent',
  details: {},
  estimatedValue: 0,
  branchId: 'br-taawun',
  departmentId: 'dp-prim-g',
  attachments: [],
  ...over,
});

const requester = ctxFor('req', ['request.create.building-maintenance', 'request.create.purchase-request', 'request.cancel.own', 'request.confirm', 'request.rate']);
const supervisor = (now = T0) => ctxFor('sup', ['request.approve.branch', 'request.reject'], now);
const lead = (now = T0) => ctxFor('lead', ['request.assign', 'request.execute', 'request.close', 'request.escalate'], now);

const create = (over: Partial<RequestDraft> = {}, ctx = requester) => createRequest(draft(over), ctx, 123, 'r-1').request;

describe('approval chain', () => {
  const chain = (estimatedValue: number) =>
    buildApprovalChain({ service: 'purchase-request', priority: 'normal', estimatedValue, details: {} }, DEFAULT_SETTINGS.approvalLimits).map((s) => s.permissionKey);

  it('follows the financial limits', () => {
    expect(chain(4000)).toEqual(['request.approve.department']);
    expect(chain(5000)).toEqual(['request.approve.department']);
    expect(chain(6000)).toEqual(['request.approve.department', 'request.approve.finance']);
    expect(chain(60000)).toEqual(['request.approve.department', 'request.approve.finance', 'request.approve.executive']);
  });

  it('recomputes live when the limits change, keeping decisions already made', () => {
    const r = create({ service: 'purchase-request', estimatedValue: 8000 });
    expect(r.approvals.map((s) => s.permissionKey)).toEqual(['request.approve.department', 'request.approve.finance']);
    r.approvals[0].state = 'approved';
    const raised = recomputeChain(r, { departmentMax: 10000, financeMax: 50000 });
    expect(raised.map((s) => [s.permissionKey, s.state])).toEqual([
      ['request.approve.department', 'approved'],
      ['request.approve.finance', 'skipped'],
    ]);
    const lowered = recomputeChain(r, { departmentMax: 1000, financeMax: 5000 });
    expect(lowered.map((s) => s.permissionKey)).toEqual([
      'request.approve.department',
      'request.approve.finance',
      'request.approve.executive',
    ]);
  });

  it('emergency building maintenance has no approval; other priorities need the branch supervisor', () => {
    expect(create({ priority: 'emergency' }).approvals).toHaveLength(0);
    expect(create({ priority: 'urgent' }).approvals.map((s) => s.permissionKey)).toEqual(['request.approve.branch']);
  });
});

describe('creating a request', () => {
  it('rejects users without the create permission and blank titles', () => {
    expect(() => createRequest(draft(), ctxFor('x', []), 1, 'r')).toThrow(WorkflowError);
    expect(() => createRequest(draft({ titleAr: '  ' }), requester, 1, 'r')).toThrow(/عنوان/);
  });

  it('generates the reference number and waits for approval', () => {
    const { request, notifications } = createRequest(draft(), requester, 123, 'r-1');
    expect(request.refNo).toBe('MNH-2026-000123');
    expect(request.status).toBe('pending_approval');
    expect(request.sla.startedAt).toBeNull();
    expect(notifications.some((n) => n.userId === 'req')).toBe(true);
    expect(notifications.some((n) => n.userId === 'approver-1' && n.kind === 'approval')).toBe(true);
  });

  it('routes emergencies automatically and starts the SLA clock', () => {
    const r = create({ priority: 'emergency' });
    expect(r.status).toBe('approved');
    expect(r.sla.startedAt).toBe(T0.toISOString());
    expect(r.sla.targetHours).toBe(4);
    expect(r.timeline.map((e) => e.type)).toEqual(['created', 'routed']);
  });

  it('sends services that need review to the reviewer first and marks sensitive ones confidential', () => {
    const ctx = ctxFor('wk', ['request.create.traffic-accident']);
    const r = createRequest(draft({ service: 'traffic-accident' }), ctx, 5, 'r-2').request;
    expect(r.status).toBe('new');
    expect(r.confidential).toBe(true);
  });
});

describe('approvals', () => {
  it('lets the approver advance the request and records who approved', () => {
    const r = create();
    const done = perform(r, 'approve', supervisor(at(1)), { noteAr: 'موافق' }).request;
    expect(done.status).toBe('approved');
    expect(done.approvals[0]).toMatchObject({ state: 'approved', actorId: 'sup', noteAr: 'موافق' });
    expect(done.sla.startedAt).toBe(at(1).toISOString());
  });

  it('refuses users without the approval permission and self-approval', () => {
    const r = create();
    expect(() => perform(r, 'approve', ctxFor('other', ['request.assign']))).toThrow(WorkflowError);
    const selfApprover = ctxFor('req', ['request.approve.branch']);
    expect(() => perform(r, 'approve', selfApprover)).toThrow(/بنفسك/);
  });

  it('requires a reason to reject or return and notifies the requester', () => {
    const r = create();
    expect(() => perform(r, 'reject', supervisor(), {})).toThrow(/سبب الرفض/);
    expect(() => perform(r, 'return', supervisor(), {})).toThrow(/استكماله/);
    const rejected = perform(r, 'reject', supervisor(), { noteAr: 'غير مبرر' });
    expect(rejected.request.status).toBe('rejected');
    expect(rejected.request.statusNoteAr).toBe('غير مبرر');
    expect(rejected.notifications.map((n) => n.userId)).toContain('req');
  });

  it('returns for completion and re-enters the chain on resubmit', () => {
    const r = create();
    const returned = perform(r, 'return', supervisor(), { noteAr: 'أرفق صورة' }).request;
    expect(returned.status).toBe('returned');
    expect(returned.approvals[0].state).toBe('returned');
    const resubmitted = perform(returned, 'resubmit', requester).request;
    expect(resubmitted.status).toBe('pending_approval');
    expect(resubmitted.approvals[0].state).toBe('pending');
  });

  it('allows cancelling only before approval, only by the requester', () => {
    const r = create();
    expect(() => perform(r, 'cancel', ctxFor('stranger', ['request.cancel.own']))).toThrow(WorkflowError);
    const approved = perform(r, 'approve', supervisor()).request;
    expect(() => perform(approved, 'cancel', requester)).toThrow(/بعد اعتماده/);
    expect(perform(r, 'cancel', requester).request.status).toBe('cancelled');
  });
});

describe('execution lifecycle', () => {
  const approved = () => perform(create(), 'approve', supervisor(at(0))).request;

  it('assign → hold → resume → complete → confirm → rate', () => {
    let r = perform(approved(), 'assign', lead(at(1)), { assigneeId: 'tech', assigneeName: 'فني' }).request;
    expect(r).toMatchObject({ status: 'in_progress', assigneeId: 'tech' });

    expect(() => perform(r, 'hold', lead(at(2)), {})).toThrow(/سبب التعليق/);
    r = perform(r, 'hold', lead(at(2)), { holdReason: 'parts' }).request;
    expect(r).toMatchObject({ status: 'on_hold', holdReason: 'parts' });
    expect(r.sla.pausedSince).toBe(at(2).toISOString());

    r = perform(r, 'resume', lead(at(10))).request;
    expect(r.status).toBe('in_progress');
    expect(r.sla.pausedMs).toBe(8 * 3_600_000);
    // 10h elapsed since start (t=0) minus 8h paused = 2h of running time at t=10.
    expect(slaElapsedMs(r.sla, at(10))).toBe(2 * 3_600_000);

    r = perform(r, 'complete', lead(at(12)), { noteAr: 'تم التبديل' }).request;
    expect(r.status).toBe('pending_confirmation');
    expect(r.sla.stoppedAt).toBe(at(12).toISOString());

    r = perform(r, 'confirm', requester, { outcome: 'accepted', rating: { stars: 5 } }).request;
    expect(r.status).toBe('closed');
    expect(r.rating?.stars).toBe(5);
    expect(r.confirmation?.outcome).toBe('accepted');
  });

  it('returns to in-progress, with the note, when the requester rejects the result', () => {
    let r = perform(approved(), 'assign', lead(at(1)), { assigneeId: 'tech', assigneeName: 'فني' }).request;
    r = perform(r, 'complete', lead(at(3))).request;
    expect(() => perform(r, 'reject_result', requester, {})).toThrow(/سبب/);
    r = perform(r, 'reject_result', requester, { noteAr: 'ما زال العطل' }).request;
    expect(r.status).toBe('in_progress');
    expect(r.sla.stoppedAt).toBeUndefined();
    expect(r.timeline.at(-1)?.noteAr).toBe('ما زال العطل');
  });

  it('only the requester can confirm', () => {
    let r = perform(approved(), 'assign', lead(at(1)), { assigneeId: 'tech', assigneeName: 'فني' }).request;
    r = perform(r, 'complete', lead(at(2))).request;
    expect(() => perform(r, 'confirm', ctxFor('other', ['request.confirm']), { outcome: 'accepted' })).toThrow(WorkflowError);
  });

  it('records costs while in progress', () => {
    const r = perform(approved(), 'assign', lead(at(1)), { assigneeId: 'tech', assigneeName: 'فني' }).request;
    const withCost = perform(r, 'add_cost', lead(at(2)), { cost: { kind: 'part', descriptionAr: 'مكثف', quantity: 2, unitCost: 85 } }).request;
    expect(withCost.costs).toHaveLength(1);
    expect(() => perform(r, 'add_cost', lead(at(2)), { cost: { kind: 'part', descriptionAr: '', quantity: 1, unitCost: 1 } })).toThrow(WorkflowError);
  });
});

describe('describeActions', () => {
  it('hides what the user can never do and disables what is not possible now', () => {
    const r = create();
    const forSupervisor = describeActions(r, supervisor());
    expect(forSupervisor.map((a) => a.key)).toEqual(expect.arrayContaining(['approve', 'reject']));
    expect(forSupervisor.map((a) => a.key)).not.toContain('assign');
    expect(forSupervisor.find((a) => a.key === 'approve')?.enabled).toBe(true);

    const forLead = describeActions(r, lead());
    const assign = forLead.find((a) => a.key === 'assign');
    expect(assign).toMatchObject({ enabled: false });
    expect(assign?.disabledReasonAr).toBeTruthy();

    const forRequester = describeActions(r, requester).map((a) => a.key);
    expect(forRequester).toContain('cancel');
    expect(forRequester).not.toContain('approve');
  });
});

describe('SLA sweep', () => {
  const inProgress = (): ServiceRequest => {
    const approved = perform(create({ priority: 'emergency' }), 'assign', lead(at(0)), { assigneeId: 'tech', assigneeName: 'فني' });
    return approved.request;
  };

  it('does nothing before the target and escalates once after it', () => {
    const r = inProgress(); // emergency = 4h
    const system = (now: Date) => ctxFor('system', [], now);
    expect(sweepSla(r, system(at(3)))).toBeNull();
    const result = sweepSla(r, system(at(5)))!;
    expect(result.request.sla).toMatchObject({ breached: true, escalated: true });
    expect(result.request.timeline.map((e) => e.type).slice(-2)).toEqual(['sla_breach', 'escalated']);
    expect(result.notifications.map((n) => n.userId)).toContain('senior-1');
    expect(sweepSla(result.request, system(at(6)))).toBeNull();
  });

  it('does not run while paused or after completion', () => {
    const held = perform(inProgress(), 'hold', lead(at(1)), { holdReason: 'parts' }).request;
    expect(sweepSla(held, ctxFor('system', [], at(100)))).toBeNull();
  });
});
