import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, forkJoin, from, map, of, switchMap, tap, toArray } from 'rxjs';
import { CHANNEL_LABELS } from '../../domain/models/platform';
import { RequestStatus, ServiceRequest } from '../../domain/models/request';
import {
  AuditRepository,
  Directory,
  NotificationRepository,
  RequestRepository,
  WarehouseRepository,
} from '../../domain/repositories';
import { FOR_LINES_KEY, FULFILMENT_KEY, Fulfilment, IssueLine, StockChange } from '../../domain/models/procurement';
import { buildReplenishmentDraft } from '../../domain/warehouse/fulfilment';
import {
  ActionDescriptor,
  ActionKey,
  ActionPayload,
  EngineContext,
  EngineResult,
  RequestDraft,
  WorkflowError,
  addComment,
  attachChildren,
  autoCloseEvent,
  createRequest,
  describeActions,
  eventShouldClose,
  linkComplaint,
  perform,
  resumeAfterReceipt,
  spawnChild,
} from '../../domain/workflows/engine';
import { planChildren } from '../../domain/workflows/event-children';
import { AuthService } from '../auth/auth.service';
import { Clock } from '../clock.service';
import { DataVersion } from '../data-version';
import { ToastService } from '../notifications/toast.service';
import { PermissionService } from '../rbac/permission.service';
import { SettingsStore } from '../settings-store';

/**
 * Facade over the request repository and the workflow engine: builds the engine context from the
 * signed-in user, runs the transition, then persists the request, notifications and audit entries.
 */
@Injectable({ providedIn: 'root' })
export class RequestService {
  private readonly repo = inject(RequestRepository);
  private readonly notificationsRepo = inject(NotificationRepository);
  private readonly auditRepo = inject(AuditRepository);
  private readonly directory = inject(Directory);
  private readonly warehouse = inject(WarehouseRepository);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly settings = inject(SettingsStore);
  private readonly clock = inject(Clock);
  private readonly version = inject(DataVersion);
  private readonly toasts = inject(ToastService);

  /** Engine context for the signed-in user. Throws if nobody is signed in. */
  context(): EngineContext {
    const user = this.auth.currentUser();
    if (!user) throw new WorkflowError('يجب تسجيل الدخول أولًا.');
    const { approvalLimits, slaHours } = this.settings.settings();
    return {
      actor: { id: user.id, nameAr: user.nameAr, mobile: user.mobile },
      actorRoleAr: this.permissions.roles()[0]?.nameAr ?? user.jobTitleAr,
      can: (key, resource) => this.permissions.can(key, resource),
      now: this.clock.now(),
      limits: approvalLimits,
      slaHours,
      usersWith: (key, resource) => this.directory.usersWith(key, resource),
      roleUsers: (roleId) => this.directory.roleUsers(roleId),
    };
  }

  list(): Observable<ServiceRequest[]> {
    return this.repo.list();
  }

  get(id: string): Observable<ServiceRequest> {
    return this.repo.get(id);
  }

  create(draft: RequestDraft): Observable<ServiceRequest> {
    let result: EngineResult | undefined;
    return this.repo
      .create((seq, id) => {
        result = createRequest(draft, this.context(), seq, id);
        return result.request;
      })
      .pipe(
        switchMap((saved) => this.afterWrite(saved, result!)),
        switchMap((saved) => this.linkComplaintTarget(saved)),
      );
  }

  perform(id: string, action: ActionKey, payload: ActionPayload = {}): Observable<ServiceRequest> {
    return this.repo.get(id).pipe(
      map((request) => perform(request, action, this.context(), payload)),
      switchMap((result) => this.repo.save(result.request).pipe(switchMap((saved) => this.afterWrite(saved, result)))),
      switchMap((saved) => (action === 'receive_goods' ? this.afterReceipt(saved) : of(saved))),
      switchMap((saved) => this.afterEventRules(saved)),
    );
  }

  /**
   * Parts or items the warehouse cannot cover: a purchase request in the actor's name is linked to the parent
   * (which is already on hold). Receiving that purchase replenishes stock and resumes the parent.
   */
  createLinkedPurchase(parent: ServiceRequest, shortages: readonly IssueLine[]): Observable<ServiceRequest> {
    const ctx = this.context();
    let result: EngineResult | undefined;
    return this.repo
      .create((seq, id) => {
        result = spawnChild(parent, buildReplenishmentDraft(parent, shortages), ctx, seq, id, ctx.actor);
        return result.request;
      })
      .pipe(
        switchMap((child) => this.afterWrite(child, result!)),
        switchMap((child) =>
          this.repo.get(parent.id).pipe(
            map((fresh) => {
              const next = attachChildren(fresh, [child], ctx);
              const fulfilment = next.details[FULFILMENT_KEY] as Fulfilment | undefined;
              if (fulfilment) next.details[FULFILMENT_KEY] = { ...fulfilment, purchaseRef: child.refNo };
              return next;
            }),
            switchMap((next) => this.repo.save(next)),
            tap(() => this.version.bump()),
            map(() => child),
          ),
        ),
      );
  }

  /** Goods received for a stock replenishment: stock goes up, the lines are issued to the parent, which resumes. */
  private afterReceipt(purchase: ServiceRequest): Observable<ServiceRequest> {
    const lines = purchase.details[FOR_LINES_KEY] as IssueLine[] | undefined;
    if (!lines?.length || purchase.status !== 'closed') return of(purchase);
    const parentId = purchase.links.find((l) => l.relation === 'parent')?.requestId;
    const user = this.auth.currentUser();
    const by = { id: user?.id ?? null, name: user?.nameAr ?? 'النظام' };
    const ctx = this.context();
    let result: EngineResult | undefined;
    const stockIn: StockChange[] = lines.map((l) => ({ itemId: l.itemId, kind: 'in', delta: l.qty, requestId: purchase.id, requestRef: purchase.refNo, noteAr: 'استلام توريد' }));

    return this.repo
      .inspect((all) => all.find((r) => r.id === parentId)?.refNo ?? null)
      .pipe(
        switchMap((parentRef) => {
          const issue: StockChange[] = parentId
            ? lines.map((l) => ({ itemId: l.itemId, kind: 'issue', delta: -l.qty, requestId: parentId, requestRef: parentRef ?? undefined, noteAr: 'صرف للطلب الأصلي' }))
            : [];
          return this.warehouse.apply([...stockIn, ...issue], by, this.clock.nowIso());
        }),
        switchMap(() =>
          parentId
            ? this.repo.sweep((r) => {
                if (r.id !== parentId) return null;
                result = resumeAfterReceipt(r, ctx, purchase.refNo, lines) ?? undefined;
                return result?.request ?? null;
              })
            : of([] as ServiceRequest[]),
        ),
        switchMap((changed) => (result && changed.length ? this.afterWrite(changed[0], result) : of(purchase))),
        tap(() => this.version.bump()),
        map(() => purchase),
      );
  }

  comment(id: string, textAr: string, internal: boolean): Observable<ServiceRequest> {
    return this.repo.get(id).pipe(
      map((request) => addComment(request, this.context(), textAr, internal)),
      switchMap((result) => this.repo.save(result.request).pipe(switchMap((saved) => this.afterWrite(saved, result)))),
    );
  }

  /** Actions to show for this user on this request (engine-computed, permission + state aware). */
  describe(request: ServiceRequest): ActionDescriptor[] {
    return describeActions(request, this.context());
  }

  /** Candidates for the assignment dialog. */
  assignees(request: ServiceRequest) {
    return this.directory.assignableUsers({
      branchId: request.branchId,
      departmentId: request.departmentId,
      createdBy: request.requesterId,
      service: request.service,
    });
  }

  /** Cross-request rules of internal events: children are spawned on approval, the event closes when they are done. */
  private afterEventRules(saved: ServiceRequest): Observable<ServiceRequest> {
    return saved.service === 'internal-event' ? this.spawnEventChildren(saved) : this.closeParentEvent(saved);
  }

  private spawnEventChildren(event: ServiceRequest): Observable<ServiceRequest> {
    const plans = planChildren(event);
    if (event.status !== 'approved' || !plans.length || event.links.some((l) => l.relation === 'child')) return of(event);
    const ctx = this.context();
    return from(plans).pipe(
      concatMap((plan) => {
        let result: EngineResult | undefined;
        return this.repo
          .create((seq, id) => {
            result = spawnChild(event, plan.draft, ctx, seq, id);
            return result.request;
          })
          .pipe(switchMap((child) => this.afterWrite(child, result!)));
      }),
      toArray(),
      switchMap((children) => this.repo.save(attachChildren(event, children, ctx))),
      tap(() => this.version.bump()),
      catchError(() => of(event)),
    );
  }

  private closeParentEvent(child: ServiceRequest): Observable<ServiceRequest> {
    const parentId = child.links.find((l) => l.relation === 'parent')?.requestId;
    if (!parentId || !(['closed', 'executed', 'cancelled', 'rejected'] as string[]).includes(child.status)) return of(child);
    const ctx = this.context();
    let result: EngineResult | undefined;
    return this.repo
      .inspect((all) => {
        const parent = all.find((r) => r.id === parentId);
        const statuses = (parent?.links ?? [])
          .filter((l) => l.relation === 'child')
          .map((l) => all.find((r) => r.id === l.requestId)?.status)
          .filter((s): s is RequestStatus => !!s);
        return parent ? { service: parent.service, status: parent.status, statuses } : null;
      })
      .pipe(
        switchMap((info) =>
          info && eventShouldClose(info, info.statuses)
            ? this.repo.sweep((r) => {
                if (r.id !== parentId) return null;
                result = autoCloseEvent(r, ctx);
                return result.request;
              })
            : of([] as ServiceRequest[]),
        ),
        switchMap((changed) => (result && changed.length ? this.afterWrite(changed[0], result) : of(child))),
        map(() => child),
        catchError(() => of(child)),
      );
  }

  /** A complaint that names a request is linked both ways (timeline entry on the request, link on the complaint). */
  private linkComplaintTarget(complaint: ServiceRequest): Observable<ServiceRequest> {
    const targetId = complaint.details['linkedRequestId'];
    if (complaint.service !== 'complaint' || typeof targetId !== 'string') return of(complaint);
    return this.repo.get(targetId).pipe(
      map((target) => linkComplaint(target, complaint, this.context())),
      switchMap((target) => this.repo.save(target)),
      switchMap(() => this.repo.save({ ...complaint, links: [...complaint.links, { requestId: targetId, relation: 'related' as const }] })),
      tap(() => this.version.bump()),
      catchError(() => of(complaint)),
    );
  }

  /** Shows a rule violation as an Arabic toast; returns true if the error was one the user can act on. */
  reportError(error: unknown, title = 'تعذر تنفيذ الإجراء'): void {
    const message =
      error instanceof WorkflowError ? error.messageAr : ((error as { messageAr?: string })?.messageAr ?? 'حدث خطأ غير متوقع.');
    this.toasts.error(title, message);
  }

  /** Persists notifications + audit for a result, refreshes lists, and shows simulated channel toasts. */
  afterWrite(saved: ServiceRequest, result: EngineResult): Observable<ServiceRequest> {
    const now = this.clock.nowIso();
    const user = this.auth.currentUser();
    const role = this.permissions.roles()[0]?.nameAr ?? '';
    return forkJoin([
      result.notifications.length
        ? this.notificationsRepo.add(
            result.notifications.map((n) => ({
              userId: n.userId,
              kind: n.kind,
              titleAr: n.titleAr,
              bodyAr: n.bodyAr,
              at: now,
              read: false,
              requestId: saved.id,
              channels: n.channels,
            })),
          )
        : of(undefined),
      result.audit.length
        ? this.auditRepo.add(
            result.audit.map((a) => ({
              at: now,
              actorId: user?.id ?? null,
              actorName: user ? `${user.nameAr} (${role})` : 'النظام',
              actionAr: a.actionAr,
              entityType: a.entityType,
              entityId: saved.id,
              summaryAr: a.summaryAr,
              before: a.before,
              after: a.after,
            })),
          )
        : of(undefined),
    ]).pipe(
      tap(() => {
        this.version.bump();
        this.simulateChannels(result);
      }),
      map(() => saved),
    );
  }

  private simulateChannels(result: EngineResult): void {
    for (const n of result.notifications.slice(0, 2)) {
      const channel = CHANNEL_LABELS[n.channels[0]];
      this.toasts.show('info', `${channel} (محاكاة) ← ${this.directory.userName(n.userId)}`, n.titleAr, 3500);
    }
  }
}
