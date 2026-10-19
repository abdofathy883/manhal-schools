import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { DataVersion } from '../../core/data-version';
import { liveResource } from '../../core/live-resource';
import { RequestService } from '../../core/requests/request.service';
import { ForbiddenError, NotFoundError } from '../../domain/repositories';
import { BRANCHES, DEPARTMENTS, SERVICE_BY_KEY, STATUS_META } from '../../domain/reference-data';
import { ActionDescriptor } from '../../domain/workflows/engine';
import { isTerminal } from '../../domain/workflows/sla';
import { ArDateTimePipe, MoneyPipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FileChipComponent } from '../../shared/ui/file-chip.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { SlaBadgeComponent } from '../../shared/ui/sla-badge.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { StatusStepperComponent } from '../../shared/ui/status-stepper.component';
import { StarRatingComponent } from '../../shared/ui/star-rating.component';
import { TimelineComponent } from '../../shared/ui/timeline.component';
import { ActionRunner } from './action-runner.service';
import { CommentsPanelComponent } from './comments-panel.component';
import { LinkedRequestsPanelComponent } from './linked-requests-panel.component';
import { ExecutorStagesComponent } from './executor-stages.component';
import { CostRollupComponent } from './cost-rollup.component';
import { ProcurementPanelComponent } from '../purchasing/procurement-panel.component';
import { RequestDetailsViewComponent } from './request-details-view.component';

/** Request details: header, lifecycle, role-aware action bar, details, approvals, costs, comments, timeline. */
@Component({
  selector: 'app-request-detail-page',
  imports: [
    RouterLink,
    NgbTooltipModule,
    ArDateTimePipe,
    MoneyPipe,
    EmptyStateComponent,
    FileChipComponent,
    SkeletonRowsComponent,
    SlaBadgeComponent,
    StatusBadgeComponent,
    PriorityBadgeComponent,
    StatusStepperComponent,
    StarRatingComponent,
    TimelineComponent,
    CommentsPanelComponent,
    LinkedRequestsPanelComponent,
    RequestDetailsViewComponent,
    ExecutorStagesComponent,
    CostRollupComponent,
    ProcurementPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  templateUrl: './request-detail-page.component.html',
})
export class RequestDetailPageComponent {
  private readonly requests = inject(RequestService);
  private readonly auth = inject(AuthService);
  private readonly version = inject(DataVersion);
  private readonly runner = inject(ActionRunner);
  private readonly permissions = inject(PermissionService);

  /** Route param `:id`. */
  readonly id = input.required<string>();

  protected readonly busy = signal(false);

  protected readonly data = liveResource(
    () => ({ id: this.id(), user: this.auth.currentUser()?.id ?? null }),
    (p) => this.requests.get(p.id),
  );

  protected readonly request = computed(() => (this.data.hasValue() ? this.data.value() : undefined));
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly forbidden = computed(() => this.data.error() instanceof ForbiddenError);
  protected readonly notFound = computed(() => this.data.error() instanceof NotFoundError);

  protected readonly actions = computed<ActionDescriptor[]>(() => {
    const r = this.request();
    return r ? this.requests.describe(r) : [];
  });
  protected readonly primaryActions = computed(() => this.actions().filter((a) => a.tone !== 'secondary'));
  protected readonly secondaryActions = computed(() => this.actions().filter((a) => a.tone === 'secondary'));

  protected readonly service = computed(() => (this.request() ? SERVICE_BY_KEY[this.request()!.service] : null));
  protected readonly branchName = computed(() => BRANCHES.find((b) => b.id === this.request()?.branchId)?.nameAr ?? 'مركزي');
  protected readonly departmentName = computed(() => DEPARTMENTS.find((d) => d.id === this.request()?.departmentId)?.nameAr ?? '—');
  protected readonly totalCost = computed(() => (this.request()?.costs ?? []).reduce((sum, c) => sum + c.quantity * c.unitCost, 0));
  protected readonly terminal = computed(() => (this.request() ? isTerminal(this.request()!.status) : false));
  protected readonly statusLabel = computed(() => (this.request() ? STATUS_META[this.request()!.status].labelAr : ''));
  /** Executor-only stages (building maintenance): shown to those who may execute or close it, once it is routed. */
  protected readonly showExecutorStages = computed(() => {
    const r = this.request();
    if (!r || (r.service !== 'building-maintenance' && r.service !== 'vehicle-maintenance')) return false;
    if (!(['approved', 'in_progress', 'on_hold', 'executed', 'pending_confirmation', 'closed'] as string[]).includes(r.status)) return false;
    const res = { branchId: r.branchId, departmentId: r.departmentId, createdBy: r.requesterId, assigneeId: r.assigneeId ?? null, service: r.service };
    return this.permissions.can('request.execute', res) || this.permissions.can('request.close', res);
  });
  protected readonly isRequester = computed(() => this.request()?.requesterId === this.auth.currentUser()?.id);

  protected readonly costKinds: Record<string, string> = { part: 'قطعة غيار', labour: 'أعمال', purchase: 'مشتريات', other: 'أخرى' };
  protected readonly stepIcons: Record<string, string> = {
    pending: 'bi-hourglass-split text-warning',
    approved: 'bi-check-circle-fill text-success',
    rejected: 'bi-x-circle-fill text-danger',
    returned: 'bi-arrow-return-right text-warning',
    skipped: 'bi-dash-circle text-secondary',
  };
  protected readonly stepLabels: Record<string, string> = {
    pending: 'بانتظار القرار',
    approved: 'تم الاعتماد',
    rejected: 'مرفوض',
    returned: 'مُعاد للاستكمال',
    skipped: 'غير مطلوب',
  };

  protected async run(action: ActionDescriptor): Promise<void> {
    const r = this.request();
    if (!r || this.busy()) return;
    this.busy.set(true);
    try {
      await this.runner.run(r, action);
    } finally {
      this.busy.set(false);
    }
  }

  protected refresh(): void {
    this.version.bump();
  }

  protected print(): void {
    window.print();
  }
}
