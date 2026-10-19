import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { NowService } from '../../core/now.service';
import { RequestService } from '../../core/requests/request.service';
import { ServiceRequest } from '../../domain/models/request';
import { BRANCHES, DEPARTMENTS, SERVICE_BY_KEY } from '../../domain/reference-data';
import { ActionDescriptor } from '../../domain/workflows/engine';
import { currentStep } from '../../domain/workflows/approval-chain';
import { formatDuration } from '../../domain/workflows/sla';
import { ArDateTimePipe, MoneyPipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ActionRunner } from '../requests/action-runner.service';

interface InboxRow {
  request: ServiceRequest;
  stepLabel: string;
  waiting: string;
  actions: ActionDescriptor[];
}

/** Approvals inbox: what is waiting for my decision (approve / reject / return with a note) and what I decided before. */
@Component({
  selector: 'app-approvals-page',
  imports: [
    RouterLink,
    ArDateTimePipe,
    MoneyPipe,
    EmptyStateComponent,
    PageHeaderComponent,
    SkeletonRowsComponent,
    StatCardComponent,
    PriorityBadgeComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  templateUrl: './approvals-page.component.html',
})
export class ApprovalsPageComponent {
  private readonly requests = inject(RequestService);
  private readonly auth = inject(AuthService);
  private readonly runner = inject(ActionRunner);
  private readonly clock = inject(NowService);

  protected readonly tab = signal<'pending' | 'decided'>('pending');
  protected readonly busy = signal<string | null>(null);

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => this.requests.list(),
  );

  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly failed = computed(() => this.data.status() === 'error');

  protected readonly pending = computed<InboxRow[]>(() => {
    const now = this.clock.now().getTime();
    return (this.data.value() ?? [])
      .filter((r) => r.status === 'pending_approval')
      .map((request) => ({ request, actions: this.requests.describe(request).filter((a) => ['approve', 'return', 'reject'].includes(a.key) && a.enabled) }))
      .filter((x) => x.actions.some((a) => a.key === 'approve'))
      .map(({ request, actions }) => ({
        request,
        actions,
        stepLabel: currentStep(request)?.labelAr ?? '',
        waiting: formatDuration(now - this.waitingSince(request)),
      }))
      .sort((a, b) => a.request.createdAt.localeCompare(b.request.createdAt));
  });

  protected readonly decided = computed<ServiceRequest[]>(() => {
    const me = this.auth.currentUser()?.id;
    return (this.data.value() ?? [])
      .filter((r) => r.approvals.some((s) => s.actorId === me) || r.timeline.some((e) => e.actorId === me && (e.type === 'returned' || e.type === 'rejected')))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });

  protected readonly pendingValue = computed(() => this.pending().reduce((sum, r) => sum + r.request.estimatedValue, 0));
  protected readonly oldest = computed(() => this.pending()[0]?.waiting ?? '—');

  protected approval(r: ServiceRequest) {
    const me = this.auth.currentUser()?.id;
    return r.approvals.find((s) => s.actorId === me);
  }

  protected serviceName(r: ServiceRequest): string {
    return SERVICE_BY_KEY[r.service].nameAr;
  }

  protected place(r: ServiceRequest): string {
    const branch = BRANCHES.find((b) => b.id === r.branchId)?.nameAr.replace('فرع ', '') ?? 'مركزي';
    const dept = DEPARTMENTS.find((d) => d.id === r.departmentId)?.nameAr;
    return dept ? `${branch} — ${dept}` : branch;
  }

  protected tone(a: ActionDescriptor): string {
    return a.key === 'approve' ? 'btn-success' : a.key === 'reject' ? 'btn-outline-danger' : 'btn-outline-warning';
  }

  protected async act(row: InboxRow, action: ActionDescriptor): Promise<void> {
    if (this.busy()) return;
    this.busy.set(row.request.id);
    try {
      await this.runner.run(row.request, action);
    } finally {
      this.busy.set(null);
    }
  }

  /** When the request started waiting for the current decision (the last status change). */
  private waitingSince(r: ServiceRequest): number {
    const statusEvents = r.timeline.filter((e) => e.type === 'status' || e.type === 'approved' || e.type === 'created');
    const last = statusEvents.at(-1);
    return new Date(last?.at ?? r.createdAt).getTime();
  }
}
