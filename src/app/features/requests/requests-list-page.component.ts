import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap/dropdown';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap/pagination';
import { startWith } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { NowService } from '../../core/now.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { SCOPE_LABELS } from '../../domain/models/rbac';
import { RequestStatus, ServiceKey, ServiceRequest } from '../../domain/models/request';
import {
  BRANCHES,
  DEPARTMENTS,
  PRIORITY_LABELS,
  SERVICES,
  SERVICE_BY_KEY,
  STATUS_META,
} from '../../domain/reference-data';
import { isOverdue, isTerminal } from '../../domain/workflows/sla';
import { ArDatePipe, formatDate } from '../../shared/pipes/format';
import { downloadCsv } from '../../shared/util/csv';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { SlaBadgeComponent } from '../../shared/ui/sla-badge.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const PAGE_SIZE = 10;

/** Request list used for "طلباتي" (mine) and "طلبات ضمن نطاقي" (everything the data layer lets me see). */
@Component({
  selector: 'app-requests-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgbDropdownModule,
    NgbPaginationModule,
    ArDatePipe,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonRowsComponent,
    SlaBadgeComponent,
    StatusBadgeComponent,
    PriorityBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  templateUrl: './requests-list-page.component.html',
})
export class RequestsListPageComponent {
  private readonly requests = inject(RequestService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly clock = inject(NowService);

  /** Route data: `mine` or `scope`. */
  readonly mode = input<'mine' | 'scope'>('mine');
  /** Optional query params that preselect filters (links from the home dashboard). */
  readonly status = input<RequestStatus | undefined>();
  readonly service = input<ServiceKey | undefined>();
  readonly overdue = input<string | undefined>();
  /** Page title override (e.g. the complaints inbox). */
  readonly heading = input<string | undefined>();

  protected readonly services = SERVICES;
  protected readonly branches = BRANCHES;
  protected readonly statusOptions = (Object.keys(STATUS_META) as RequestStatus[]).map((k) => ({ key: k, label: STATUS_META[k].labelAr }));
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly page = signal(1);

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    service: new FormControl<ServiceKey | ''>('', { nonNullable: true }),
    status: new FormControl<RequestStatus | ''>('', { nonNullable: true }),
    branch: new FormControl('', { nonNullable: true }),
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    assignee: new FormControl('', { nonNullable: true }),
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

  protected readonly title = computed(() => this.heading() ?? (this.mode() === 'mine' ? 'طلباتي' : 'طلبات ضمن نطاقي'));
  protected readonly subtitle = computed(() => {
    if (this.mode() === 'mine') return 'الطلبات التي قدمتها وحالة كل منها.';
    const scope = this.permissions.scopeOf('request.view');
    return scope ? `كل ما تسمح به صلاحيتك (النطاق: ${SCOPE_LABELS[scope]}).` : '';
  });
  protected readonly canExport = computed(() => this.permissions.can('request.export'));

  /** Requests of the current mode, before applying the filter form. */
  private readonly base = computed(() => {
    const me = this.auth.currentUser()?.id;
    const all = this.data.value() ?? [];
    return this.mode() === 'mine' ? all.filter((r) => r.requesterId === me) : all;
  });

  protected readonly assignees = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.base()) if (r.assigneeId && r.assigneeName) map.set(r.assigneeId, r.assigneeName);
    return [...map].map(([id, name]) => ({ id, name }));
  });

  protected readonly filtered = computed(() => {
    const f = this.filterValues();
    const q = (f.q ?? '').trim().toLowerCase();
    const now = this.clock.now();
    const from = f.from ? new Date(f.from).getTime() : null;
    const to = f.to ? new Date(f.to).getTime() + 86_400_000 : null;
    return this.base()
      .filter((r) => {
        if (q && !`${r.refNo} ${r.titleAr} ${r.requesterName}`.toLowerCase().includes(q)) return false;
        if (f.service && r.service !== f.service) return false;
        if (f.status && r.status !== f.status) return false;
        if (f.branch && r.branchId !== f.branch) return false;
        if (f.assignee && r.assigneeId !== f.assignee) return false;
        if (f.overdueOnly && !isOverdue(r, now)) return false;
        const created = new Date(r.createdAt).getTime();
        if (from !== null && created < from) return false;
        if (to !== null && created >= to) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  protected readonly pageItems = computed(() => this.filtered().slice((this.page() - 1) * PAGE_SIZE, this.page() * PAGE_SIZE));
  protected readonly pageSize = PAGE_SIZE;
  protected readonly hasFilters = computed(() => Object.values(this.filterValues()).some((v) => !!v));

  constructor() {
    this.filters.valueChanges.subscribe(() => this.page.set(1));
    // Preselected filters from query params (e.g. home dashboard cards).
    queueMicrotask(() => {
      this.filters.patchValue(
        { status: this.status() ?? '', service: this.service() ?? '', overdueOnly: this.overdue() === '1' },
        { emitEvent: true },
      );
    });
  }

  protected serviceName(key: ServiceKey): string {
    return SERVICE_BY_KEY[key].nameAr;
  }

  protected branchName(id: string | null): string {
    return BRANCHES.find((b) => b.id === id)?.nameAr.replace('فرع ', '') ?? 'مركزي';
  }

  protected departmentName(id: string | null): string {
    return DEPARTMENTS.find((d) => d.id === id)?.nameAr ?? '—';
  }

  protected isActive(r: ServiceRequest): boolean {
    return !isTerminal(r.status);
  }

  protected open(r: ServiceRequest): void {
    void this.router.navigate(['/requests', r.id]);
  }

  protected reset(): void {
    this.filters.reset({ q: '', service: '', status: '', branch: '', from: '', to: '', assignee: '', overdueOnly: false });
  }

  protected exportCsv(): void {
    const headers = ['الرقم المرجعي', 'العنوان', 'الخدمة', 'مقدم الطلب', 'الفرع', 'القسم', 'الأولوية', 'الحالة', 'المنفّذ', 'تاريخ الإنشاء', 'التكلفة (ر.س)'];
    const rows = this.filtered().map((r) => [
      r.refNo,
      r.titleAr,
      this.serviceName(r.service),
      r.requesterName,
      this.branchName(r.branchId),
      this.departmentName(r.departmentId),
      PRIORITY_LABELS[r.priority],
      STATUS_META[r.status].labelAr,
      r.assigneeName ?? '',
      formatDate(r.createdAt),
      r.costs.reduce((sum, c) => sum + c.quantity * c.unitCost, 0),
    ]);
    downloadCsv(`requests-${new Date().toISOString().slice(0, 10)}`, headers, rows);
  }

  protected print(): void {
    window.print();
  }
}
