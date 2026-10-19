import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgbOffcanvas, NgbOffcanvasModule } from '@ng-bootstrap/ng-bootstrap/offcanvas';
import { startWith } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { NowService } from '../../core/now.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { ToastService } from '../../core/notifications/toast.service';
import { RequestStatus, ServiceKey, ServiceRequest } from '../../domain/models/request';
import { BRANCHES, SERVICES, SERVICE_BY_KEY } from '../../domain/reference-data';
import { ActionDescriptor, ActionKey, ActionPayload } from '../../domain/workflows/engine';
import { isOverdue } from '../../domain/workflows/sla';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { SlaBadgeComponent } from '../../shared/ui/sla-badge.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ActionRunner } from '../requests/action-runner.service';
import { AssignDrawerComponent, Candidate } from './assign-drawer.component';

interface Column {
  key: string;
  title: string;
  icon: string;
  tone: string;
  statuses: readonly RequestStatus[];
}

interface Card {
  request: ServiceRequest;
  overdue: boolean;
  /** The one next step this user can take from the card (assign, start, review, resume …). */
  next?: ActionDescriptor;
}

const COLUMNS: readonly Column[] = [
  { key: 'new', title: 'جديد', icon: 'bi-inbox', tone: 'info', statuses: ['new', 'under_review', 'approved'] },
  { key: 'progress', title: 'قيد التنفيذ', icon: 'bi-gear', tone: 'primary', statuses: ['in_progress'] },
  { key: 'hold', title: 'معلّق', icon: 'bi-pause-circle', tone: 'warning', statuses: ['on_hold'] },
  { key: 'done', title: 'تم التنفيذ', icon: 'bi-check2-circle', tone: 'success', statuses: ['executed', 'pending_confirmation'] },
];

/** Order in which a card's single "next step" button is chosen. */
const NEXT_ORDER: readonly ActionKey[] = ['start_review', 'review_pass', 'assign', 'start', 'issue_items', 'resume', 'complete', 'close'];

/**
 * Executor workbench: kanban + list of the work I can act on, with live SLA timers and an assignment
 * drawer. A technician only ever receives the jobs assigned to them (enforced by the data layer).
 */
@Component({
  selector: 'app-workbench-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgbOffcanvasModule,
    EmptyStateComponent,
    PageHeaderComponent,
    SkeletonRowsComponent,
    SlaBadgeComponent,
    PriorityBadgeComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  templateUrl: './workbench-page.component.html',
})
export class WorkbenchPageComponent {
  private readonly requests = inject(RequestService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly runner = inject(ActionRunner);
  private readonly offcanvas = inject(NgbOffcanvas);
  private readonly toasts = inject(ToastService);
  private readonly clock = inject(NowService);

  protected readonly columns = COLUMNS;
  protected readonly services = SERVICES;
  protected readonly branches = BRANCHES;
  protected readonly view = signal<'kanban' | 'list'>('kanban');
  protected readonly busy = signal<string | null>(null);

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    service: new FormControl<ServiceKey | ''>('', { nonNullable: true }),
    branch: new FormControl('', { nonNullable: true }),
    mine: new FormControl(false, { nonNullable: true }),
    overdueOnly: new FormControl(false, { nonNullable: true }),
  });
  private readonly filterValues = toSignal(this.filters.valueChanges.pipe(startWith(this.filters.getRawValue())), {
    initialValue: this.filters.getRawValue(),
  });

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => this.requests.list(),
  );

  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly failed = computed(() => this.data.status() === 'error');
  protected readonly isTechnicianView = computed(() => !this.permissions.can('request.assign') && !this.permissions.can('request.review'));

  /** Work I can act on, with the next step each card offers. */
  private readonly work = computed<Card[]>(() => {
    const now = this.clock.now();
    const statuses = new Set(COLUMNS.flatMap((c) => c.statuses));
    return (this.data.value() ?? [])
      .filter((r) => statuses.has(r.status))
      .filter((r) => {
        const res = { branchId: r.branchId, departmentId: r.departmentId, createdBy: r.requesterId, assigneeId: r.assigneeId ?? null, service: r.service };
        return this.permissions.canAny(['request.execute', 'request.assign', 'request.review'], res);
      })
      .map((request) => {
        const actions = this.requests.describe(request).filter((a) => a.enabled);
        const next = NEXT_ORDER.map((k) => actions.find((a) => a.key === k)).find((a) => !!a);
        return { request, overdue: isOverdue(request, now), next };
      });
  });

  protected readonly filtered = computed<Card[]>(() => {
    const f = this.filterValues();
    const q = (f.q ?? '').trim().toLowerCase();
    const me = this.auth.currentUser()?.id;
    return this.work()
      .filter((c) => {
        const r = c.request;
        if (q && !`${r.refNo} ${r.titleAr} ${r.requesterName}`.toLowerCase().includes(q)) return false;
        if (f.service && r.service !== f.service) return false;
        if (f.branch && r.branchId !== f.branch) return false;
        if (f.mine && r.assigneeId !== me) return false;
        if (f.overdueOnly && !c.overdue) return false;
        return true;
      })
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.request.createdAt.localeCompare(b.request.createdAt));
  });

  protected readonly byColumn = computed(() => COLUMNS.map((col) => ({ col, cards: this.filtered().filter((c) => col.statuses.includes(c.request.status)) })));
  protected readonly overdueCount = computed(() => this.work().filter((c) => c.overdue).length);
  protected readonly hasFilters = computed(() => Object.values(this.filterValues()).some((v) => !!v));

  protected serviceName(r: ServiceRequest): string {
    return SERVICE_BY_KEY[r.service].nameAr;
  }

  protected place(r: ServiceRequest): string {
    return BRANCHES.find((b) => b.id === r.branchId)?.nameAr ?? 'مركزي';
  }

  protected async step(card: Card): Promise<void> {
    if (!card.next || this.busy()) return;
    this.busy.set(card.request.id);
    try {
      if (card.next.key === 'assign') await this.assign(card.request, card.next);
      else await this.runner.run(card.request, card.next);
    } finally {
      this.busy.set(null);
    }
  }

  protected async assign(request: ServiceRequest, action: ActionDescriptor): Promise<void> {
    const all = this.data.value() ?? [];
    const candidates: Candidate[] = this.requests.assignees(request).map((user) => ({
      user,
      active: all.filter((r) => r.assigneeId === user.id && r.status === 'in_progress').length,
    }));
    const ref = this.offcanvas.open(AssignDrawerComponent, { position: 'start', ariaLabelledBy: 'assign-title' });
    (ref.componentInstance as AssignDrawerComponent).init(request, candidates);
    let payload: ActionPayload;
    try {
      payload = (await ref.result) as ActionPayload;
    } catch {
      return;
    }
    try {
      await new Promise<void>((resolve, reject) =>
        this.requests.perform(request.id, action.key, payload).subscribe({ next: () => resolve(), error: reject }),
      );
      this.toasts.success('تم الإسناد', `${request.refNo} ← ${payload.assigneeName}`);
    } catch (err) {
      this.requests.reportError(err);
    }
  }

  protected reset(): void {
    this.filters.reset({ q: '', service: '', branch: '', mine: false, overdueOnly: false });
  }
}
