import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { liveResource } from '../../core/live-resource';
import { RequestService } from '../../core/requests/request.service';
import { breakdown, isReplenishment, operationalCost, rollUp } from '../../domain/costing';
import { ServiceRequest } from '../../domain/models/request';
import { BRANCHES, DEPARTMENTS } from '../../domain/reference-data';
import { MoneyPipe } from '../../shared/pipes/format';

interface ChildCost {
  id: string;
  refNo: string;
  titleAr: string;
  total: number;
  restock: boolean;
}

/**
 * Cost roll-up of a request: parts + labour + purchases, the cost of linked child requests, and where it lands
 * (branch, department, vehicle) among the requests the viewer may see.
 */
@Component({
  selector: 'app-cost-rollup',
  imports: [RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section class="card mb-4">
        <div class="card-header"><i class="bi bi-cash-stack me-2" aria-hidden="true"></i>تجميع التكلفة</div>
        <dl class="list-group list-group-flush mb-0">
          <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">قطع الغيار / الأصناف</dt><dd class="mb-0">{{ own().parts | money }}</dd></div>
          <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">العمالة</dt><dd class="mb-0">{{ own().labour | money }}</dd></div>
          <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">المشتريات</dt><dd class="mb-0">{{ own().purchase + own().other | money }}</dd></div>
          @for (c of children.value() ?? []; track c.id) {
            <div class="list-group-item d-flex justify-content-between gap-2">
              <dt class="fw-normal text-muted-ar"><a [routerLink]="['/requests', c.id]" class="text-decoration-none"><span class="ltr-inline">{{ c.refNo }}</span></a> (مرتبط)</dt>
              <dd class="mb-0">
                @if (c.restock) {
                  <span class="small text-muted-ar">تُحسب عند الصرف</span>
                } @else {
                  {{ c.total | money }}
                }
              </dd>
            </div>
          }
          <div class="list-group-item d-flex justify-content-between fw-bold"><dt>الإجمالي مع الطلبات المرتبطة</dt><dd class="mb-0">{{ total() | money }}</dd></div>
        </dl>
        @if (context().length) {
          <div class="card-body border-top small">
            <div class="text-muted-ar mb-1">على مستوى (ضمن ما تراه):</div>
            @for (c of context(); track c.label) {
              <div class="d-flex justify-content-between"><span>{{ c.label }}</span><span class="fw-semibold">{{ c.total | money }} <span class="text-muted-ar">({{ c.count }} طلبات)</span></span></div>
            }
          </div>
        }
      </section>
    }
  `,
})
export class CostRollupComponent {
  private readonly requests = inject(RequestService);

  readonly request = input.required<ServiceRequest>();

  protected readonly own = computed(() => breakdown(this.request().costs));

  protected readonly children = liveResource(
    () => ({ links: this.request().links.filter((l) => l.relation === 'child').map((l) => l.requestId) }),
    (p) =>
      p.links.length === 0
        ? of([] as ChildCost[])
        : forkJoin(
            p.links.map((id) =>
              this.requests.get(id).pipe(
                map((r): ChildCost | null => ({ id: r.id, refNo: r.refNo, titleAr: r.titleAr, total: operationalCost(r), restock: isReplenishment(r) })),
                catchError(() => of(null)),
              ),
            ),
          ).pipe(map((list) => list.filter((c): c is ChildCost => c !== null))),
  );

  protected readonly total = computed(() => this.own().total + (this.children.value() ?? []).reduce((sum, c) => sum + c.total, 0));
  protected readonly visible = computed(() => this.total() > 0 || (this.children.value()?.length ?? 0) > 0);

  private readonly all = liveResource(
    () => ({ id: this.request().id }),
    () => this.requests.list(),
  );

  /** Where the cost of this request lands: branch, department and vehicle totals (operational cost only). */
  protected readonly context = computed(() => {
    const r = this.request();
    const list = this.all.value() ?? [];
    const rows: Array<{ label: string; total: number; count: number }> = [];
    const add = (label: string, key: string | null | undefined, keyFn: (x: ServiceRequest) => string | null | undefined) => {
      const entry = key ? rollUp(list, keyFn).get(key) : undefined;
      if (entry) rows.push({ label, total: entry.total, count: entry.requests });
    };
    const branch = BRANCHES.find((b) => b.id === r.branchId)?.nameAr;
    const dept = DEPARTMENTS.find((d) => d.id === r.departmentId)?.nameAr;
    add(`الفرع: ${branch ?? ''}`, r.branchId, (x) => x.branchId);
    add(`القسم: ${dept ?? ''}`, r.departmentId && r.branchId ? `${r.branchId}|${r.departmentId}` : null, (x) => (x.branchId && x.departmentId ? `${x.branchId}|${x.departmentId}` : null));
    const vehicle = r.details['vehicleId'];
    if (typeof vehicle === 'string') add(`المركبة: ${String(r.details['plate'] ?? '')}`, vehicle, (x) => x.details['vehicleId'] as string | undefined);
    return rows;
  });
}
