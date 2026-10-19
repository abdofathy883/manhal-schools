import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { RequestService } from '../../core/requests/request.service';
import { FOR_LINES_KEY, PROCUREMENT_KEY, ProcurementData } from '../../domain/models/procurement';
import { ServiceRequest } from '../../domain/models/request';
import { BRANCHES, DEPARTMENTS } from '../../domain/reference-data';
import { ReferenceRepository } from '../../domain/repositories';
import { MoneyPipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

type Filter = 'action' | 'approval' | 'done' | 'all';

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'action', label: 'بانتظار المشتريات' },
  { key: 'approval', label: 'بانتظار الاعتماد' },
  { key: 'done', label: 'منتهية' },
  { key: 'all', label: 'الكل' },
];

interface Row {
  request: ServiceRequest;
  stage: string;
  tone: string;
  where: string;
  po: string;
  supplier: string;
  restock: boolean;
}

function stageOf(r: ServiceRequest, data: ProcurementData): { label: string; tone: string } {
  switch (r.status) {
    case 'pending_approval':
    case 'new':
      return { label: 'بانتظار الاعتماد', tone: 'warning' };
    case 'approved':
      return { label: 'بانتظار العروض / أمر التوريد', tone: 'primary' };
    case 'in_progress':
      return data.po ? { label: 'بانتظار الاستلام', tone: 'info' } : data.quotes?.length ? { label: 'عروض مسجلة — بانتظار أمر التوريد', tone: 'primary' } : { label: 'قيد الدراسة', tone: 'primary' };
    case 'pending_confirmation':
      return { label: 'بانتظار تأكيد الطالب', tone: 'success' };
    case 'closed':
      return { label: 'مكتمل', tone: 'success' };
    case 'on_hold':
      return { label: 'معلّق', tone: 'warning' };
    default:
      return { label: 'مغلق', tone: 'secondary' };
  }
}

/** المشتريات: the purchase queue with each request's stage, and the suppliers with their orders. */
@Component({
  selector: 'app-purchasing-page',
  imports: [RouterLink, NgbNavModule, MoneyPipe, EmptyStateComponent, PageHeaderComponent, SkeletonRowsComponent, StatCardComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="المشتريات" subtitle="طلبات الشراء ومراحلها: عروض الأسعار، أمر التوريد، الاستلام والعهدة" />

    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="6" /></div></div>
    } @else {
      <div class="row g-3 mb-4">
        <div class="col-6 col-xl-3"><app-stat-card label="بانتظار المشتريات" [value]="counts()['action']" icon="bi-inbox" tone="primary" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="بانتظار الاعتماد" [value]="counts()['approval']" icon="bi-hourglass-split" tone="warning" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="أوامر توريد صادرة" [value]="orders()" icon="bi-file-earmark-text" tone="info" [hint]="(spend() | money) + ' إجمالي'" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="مشتريات للمستودع" [value]="restock()" icon="bi-box-seam" tone="success" hint="مرتبطة بقطع غيار واحتياجات" /></div>
      </div>

      <ul ngbNav #nav="ngbNav" [(activeId)]="tab" class="nav-tabs mb-3">
        <li ngbNavItem="queue">
          <button ngbNavLink type="button">طلبات الشراء</button>
          <ng-template ngbNavContent>
            <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="تصفية الطلبات">
              @for (f of filters; track f.key) {
                <button type="button" class="btn btn-sm" [class]="filter() === f.key ? 'btn-primary' : 'btn-outline-secondary'" [attr.aria-pressed]="filter() === f.key" (click)="filter.set(f.key)">
                  {{ f.label }} <span class="badge bg-body-secondary text-body ms-1">{{ counts()[f.key] }}</span>
                </button>
              }
            </div>
            <div class="card">
              @if (rows().length) {
                <div class="table-responsive">
                  <table class="table table-hover align-middle mb-0">
                    <caption class="visually-hidden">طلبات الشراء</caption>
                    <thead>
                      <tr>
                        <th scope="col">الطلب</th>
                        <th scope="col">الجهة</th>
                        <th scope="col">القيمة التقديرية</th>
                        <th scope="col">الحالة</th>
                        <th scope="col">المرحلة</th>
                        <th scope="col">أمر التوريد</th>
                        <th scope="col"><span class="visually-hidden">فتح</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of rows(); track row.request.id) {
                        <tr>
                          <td>
                            <a [routerLink]="['/requests', row.request.id]" class="fw-semibold text-decoration-none"><span class="ltr-inline">{{ row.request.refNo }}</span></a>
                            <div class="small text-muted-ar">{{ row.request.titleAr }}</div>
                            @if (row.restock) { <span class="badge bg-info-subtle text-info-emphasis">توريد للمستودع</span> }
                          </td>
                          <td class="small">{{ row.where }}</td>
                          <td>{{ row.request.estimatedValue | money }}</td>
                          <td><app-status-badge [status]="row.request.status" [holdReason]="row.request.holdReason" /></td>
                          <td><span class="badge" [class]="'bg-' + row.tone + '-subtle text-' + row.tone + '-emphasis'">{{ row.stage }}</span></td>
                          <td class="small">@if (row.po) { <span class="ltr-inline">{{ row.po }}</span><div class="text-muted-ar">{{ row.supplier }}</div> } @else { — }</td>
                          <td class="text-end"><a [routerLink]="['/requests', row.request.id]" class="btn btn-sm btn-outline-primary">فتح</a></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <app-empty-state title="لا توجد طلبات" message="لا توجد طلبات شراء مطابقة ضمن صلاحيتك." />
              }
            </div>
          </ng-template>
        </li>
        <li ngbNavItem="suppliers">
          <button ngbNavLink type="button">الموردون</button>
          <ng-template ngbNavContent>
            <div class="card">
              <div class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                  <caption class="visually-hidden">الموردون</caption>
                  <thead><tr><th scope="col">المورد</th><th scope="col">جهة الاتصال</th><th scope="col">الجوال</th><th scope="col">أوامر التوريد</th><th scope="col">إجمالي الأوامر</th></tr></thead>
                  <tbody>
                    @for (s of suppliers(); track s.id) {
                      <tr>
                        <td class="fw-semibold">{{ s.nameAr }}</td>
                        <td>{{ s.contactAr }}</td>
                        <td><span class="ltr-inline">{{ s.mobile }}</span></td>
                        <td><span class="ltr-inline">{{ s.orders }}</span></td>
                        <td>{{ s.amount | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </ng-template>
        </li>
      </ul>
      <div [ngbNavOutlet]="nav"></div>
    }
  `,
})
export class PurchasingPageComponent {
  private readonly requests = inject(RequestService);
  private readonly reference = inject(ReferenceRepository);
  private readonly auth = inject(AuthService);

  protected readonly tab = signal('queue');
  protected readonly filter = signal<Filter>('action');
  protected readonly filters = FILTERS;

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ requests: this.requests.list(), suppliers: this.reference.suppliers() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  private readonly all = computed<Row[]>(() =>
    (this.data.value()?.requests ?? [])
      .filter((r) => r.service === 'purchase-request')
      .map((request) => {
        const data = (request.details[PROCUREMENT_KEY] as ProcurementData | undefined) ?? {};
        const { label, tone } = stageOf(request, data);
        return {
          request,
          stage: label,
          tone,
          where: `${BRANCHES.find((b) => b.id === request.branchId)?.nameAr ?? 'مركزي'} — ${DEPARTMENTS.find((d) => d.id === request.departmentId)?.nameAr ?? ''}`,
          po: data.po?.no ?? '',
          supplier: data.po?.supplierName ?? '',
          restock: !!request.details[FOR_LINES_KEY],
        };
      })
      .sort((a, b) => b.request.createdAt.localeCompare(a.request.createdAt)),
  );

  private inFilter(r: Row, f: Filter): boolean {
    const s = r.request.status;
    switch (f) {
      case 'action':
        return s === 'approved' || s === 'in_progress';
      case 'approval':
        return s === 'pending_approval' || s === 'new';
      case 'done':
        return (['pending_confirmation', 'closed', 'rejected', 'cancelled'] as string[]).includes(s);
      default:
        return true;
    }
  }

  protected readonly counts = computed(() => Object.fromEntries(FILTERS.map((f) => [f.key, this.all().filter((r) => this.inFilter(r, f.key)).length])) as Record<Filter, number>);
  protected readonly rows = computed(() => this.all().filter((r) => this.inFilter(r, this.filter())));
  protected readonly orders = computed(() => this.all().filter((r) => r.po).length);
  protected readonly restock = computed(() => this.all().filter((r) => r.restock).length);
  protected readonly spend = computed(() => this.all().reduce((sum, r) => sum + (((r.request.details[PROCUREMENT_KEY] as ProcurementData | undefined)?.po?.amount) ?? 0), 0));

  protected readonly suppliers = computed(() => {
    const requests = this.data.value()?.requests ?? [];
    return (this.data.value()?.suppliers ?? []).map((s) => {
      const pos = requests
        .map((r) => (r.details[PROCUREMENT_KEY] as ProcurementData | undefined)?.po)
        .filter((po) => po?.supplierId === s.id);
      return { ...s, orders: pos.length, amount: pos.reduce((sum, po) => sum + (po?.amount ?? 0), 0) };
    });
  });
}
