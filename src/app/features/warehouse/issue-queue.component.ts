import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { RequestService } from '../../core/requests/request.service';
import { WarehouseService } from '../../core/warehouse/warehouse.service';
import { ServiceRequest } from '../../domain/models/request';
import { BRANCHES, DEPARTMENTS } from '../../domain/reference-data';
import { ItemQty, planFulfilment } from '../../domain/warehouse/fulfilment';
import { ArDatePipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ActionRunner } from '../requests/action-runner.service';

interface LineRow {
  name: string;
  code: string;
  qty: number;
  unit: string;
  stock: number;
  ok: boolean;
}

interface Row {
  request: ServiceRequest;
  lines: LineRow[];
  shortage: boolean;
  canIssue: boolean;
  where: string;
}

/** Warehouse-need requests waiting for the keeper: each line shows the live stock, and short lines say a purchase will follow. */
@Component({
  selector: 'app-issue-queue',
  imports: [RouterLink, ArDatePipe, EmptyStateComponent, SkeletonRowsComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <app-skeleton-rows [count]="4" />
    } @else if (rows().length === 0) {
      <div class="card"><app-empty-state title="لا توجد طلبات صرف معلّقة" message="ستظهر هنا احتياجات المستودع بعد اعتماد مدير القسم." /></div>
    } @else {
      <div class="row g-3">
        @for (row of rows(); track row.request.id) {
          <div class="col-lg-6">
            <section class="card h-100">
              <div class="card-header d-flex justify-content-between align-items-center gap-2">
                <a [routerLink]="['/requests', row.request.id]" class="text-decoration-none fw-semibold"><span class="ltr-inline">{{ row.request.refNo }}</span></a>
                <app-status-badge [status]="row.request.status" [holdReason]="row.request.holdReason" />
              </div>
              <div class="card-body">
                <div class="fw-semibold">{{ row.request.titleAr }}</div>
                <div class="small text-muted-ar mb-2">{{ row.where }} · {{ row.request.requesterName }} · <span class="ltr-inline">{{ row.request.createdAt | arDate }}</span></div>
                <table class="table table-sm align-middle mb-2">
                  <caption class="visually-hidden">أصناف الطلب</caption>
                  <thead><tr><th scope="col">الصنف</th><th scope="col">المطلوب</th><th scope="col">الرصيد</th></tr></thead>
                  <tbody>
                    @for (l of row.lines; track l.code) {
                      <tr>
                        <td>{{ l.name }} <span class="small text-muted-ar ltr-inline">{{ l.code }}</span></td>
                        <td><span class="ltr-inline">{{ l.qty }}</span> {{ l.unit }}</td>
                        <td><span class="badge" [class]="l.ok ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'"><span class="ltr-inline">{{ l.stock }}</span> {{ l.ok ? 'كافٍ' : 'غير كافٍ' }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
                @if (row.canIssue) {
                  @if (row.shortage) {
                    <div class="alert alert-warning small py-2" role="status"><i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>بعض الأصناف غير كافية: يُصرف المتوفر ويُنشأ طلب شراء مرتبط للعجز، ويعود الطلب عند الاستلام.</div>
                  }
                  <button type="button" class="btn btn-success btn-sm" [disabled]="busy()" (click)="issue(row)"><i class="bi bi-box-arrow-up me-1" aria-hidden="true"></i>صرف من المستودع</button>
                } @else if (row.request.status === 'on_hold') {
                  <div class="small text-muted-ar"><i class="bi bi-hourglass-split me-1" aria-hidden="true"></i>بانتظار وصول التوريد (طلب شراء مرتبط).</div>
                }
              </div>
            </section>
          </div>
        }
      </div>
    }
  `,
})
export class IssueQueueComponent {
  private readonly requests = inject(RequestService);
  private readonly warehouse = inject(WarehouseService);
  private readonly runner = inject(ActionRunner);
  private readonly auth = inject(AuthService);

  protected readonly busy = signal(false);

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ requests: this.requests.list(), items: this.warehouse.items() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  protected readonly rows = computed<Row[]>(() => {
    const { requests = [], items = [] } = this.data.value() ?? {};
    return requests
      .filter((r) => r.service === 'warehouse-need' && (['approved', 'in_progress', 'on_hold'] as string[]).includes(r.status))
      .map((request) => {
        const wanted = ((request.details['items'] as ItemQty[] | undefined) ?? []).map((l) => ({ itemId: l.itemId, qty: Number(l.qty) }));
        const plan = planFulfilment(items, wanted);
        const lines = wanted.map((l): LineRow => {
          const item = items.find((i) => i.id === l.itemId);
          return { name: item?.nameAr ?? l.itemId, code: item?.code ?? '', qty: l.qty, unit: item?.unitAr ?? '', stock: item?.stock ?? 0, ok: plan.issued.some((p) => p.itemId === l.itemId) };
        });
        return {
          request,
          lines,
          shortage: plan.shortages.length > 0,
          canIssue: this.requests.describe(request).some((a) => a.key === 'issue_items' && a.enabled),
          where: `${BRANCHES.find((b) => b.id === request.branchId)?.nameAr ?? 'مركزي'} — ${DEPARTMENTS.find((d) => d.id === request.departmentId)?.nameAr ?? ''}`,
        };
      });
  });

  protected async issue(row: Row): Promise<void> {
    const action = this.requests.describe(row.request).find((a) => a.key === 'issue_items');
    if (!action) return;
    this.busy.set(true);
    try {
      await this.runner.run(row.request, action);
    } finally {
      this.busy.set(false);
    }
  }
}
