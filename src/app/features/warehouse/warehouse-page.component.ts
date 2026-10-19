import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { startWith } from 'rxjs';
import { liveResource } from '../../core/live-resource';
import { PermissionService } from '../../core/rbac/permission.service';
import { WarehouseService } from '../../core/warehouse/warehouse.service';
import { StockLevel, stockLevel } from '../../domain/warehouse/fulfilment';
import { MoneyPipe, NumPipe } from '../../shared/pipes/format';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { IssueQueueComponent } from './issue-queue.component';
import { MovementsLogComponent } from './movements-log.component';
import { StockCountComponent } from './stock-count.component';
import { StockInFormComponent } from './stock-in-form.component';

type Filter = 'all' | 'low' | 'out';

const LEVEL_UI: Record<StockLevel, { label: string; cls: string }> = {
  out: { label: 'نفد', cls: 'bg-danger-subtle text-danger-emphasis' },
  low: { label: 'منخفض', cls: 'bg-warning-subtle text-warning-emphasis' },
  ok: { label: 'متوفر', cls: 'bg-success-subtle text-success-emphasis' },
};

/** المستودع: inventory with low-stock badges, issue queue, stock-in, count and the movement log. */
@Component({
  selector: 'app-warehouse-page',
  imports: [
    ReactiveFormsModule,
    NgbNavModule,
    MoneyPipe,
    NumPipe,
    PageHeaderComponent,
    SkeletonRowsComponent,
    StatCardComponent,
    IssueQueueComponent,
    StockInFormComponent,
    StockCountComponent,
    MovementsLogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="المستودع" subtitle="المخزون وحدود إعادة الطلب، وصرف الاحتياجات، وإدخال المخزون والجرد" />

    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="6" /></div></div>
    } @else {
      <div class="row g-3 mb-4">
        <div class="col-6 col-xl-3"><app-stat-card label="عدد الأصناف" [value]="items().length" icon="bi-boxes" tone="primary" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="قيمة المخزون" [value]="(stockValue() | money)" icon="bi-cash-stack" tone="info" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="أصناف منخفضة" [value]="count('low')" icon="bi-exclamation-circle" tone="warning" hint="عند حد إعادة الطلب أو دونه" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="أصناف نفدت" [value]="count('out')" icon="bi-x-octagon" tone="danger" /></div>
      </div>

      <ul ngbNav #nav="ngbNav" [(activeId)]="tab" class="nav-tabs mb-3">
        <li ngbNavItem="stock">
          <button ngbNavLink type="button">المخزون</button>
          <ng-template ngbNavContent>
            <div class="card">
              <div class="card-body">
                <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
                  <div class="flex-grow-1" style="max-inline-size: 22rem">
                    <label class="form-label" for="wh-search">بحث بالاسم أو الرمز</label>
                    <input id="wh-search" class="form-control" [formControl]="search" placeholder="مثال: مكثف أو ACR" />
                  </div>
                  <div role="group" aria-label="تصفية المخزون" class="d-flex gap-2">
                    @for (f of filters; track f.key) {
                      <button type="button" class="btn btn-sm" [class]="filter() === f.key ? 'btn-primary' : 'btn-outline-secondary'" [attr.aria-pressed]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }}</button>
                    }
                  </div>
                </div>
                <div class="table-responsive">
                  <table class="table table-hover align-middle mb-0">
                    <caption class="visually-hidden">أصناف المستودع</caption>
                    <thead>
                      <tr>
                        <th scope="col">الرمز</th>
                        <th scope="col">الصنف</th>
                        <th scope="col">الوحدة</th>
                        <th scope="col">الرصيد</th>
                        <th scope="col">حد إعادة الطلب</th>
                        <th scope="col">الموقع</th>
                        <th scope="col">سعر الوحدة</th>
                        <th scope="col">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (r of rows(); track r.item.id) {
                        <tr>
                          <td><span class="ltr-inline fw-semibold">{{ r.item.code }}</span></td>
                          <td>{{ r.item.nameAr }}</td>
                          <td>{{ r.item.unitAr }}</td>
                          <td class="fw-semibold"><span class="ltr-inline">{{ r.item.stock | num }}</span></td>
                          <td><span class="ltr-inline">{{ r.item.reorderLevel | num }}</span></td>
                          <td><span class="ltr-inline">{{ r.item.location }}</span></td>
                          <td>{{ r.item.unitPrice | money }}</td>
                          <td><span class="badge" [class]="r.ui.cls">{{ r.ui.label }}</span></td>
                        </tr>
                      } @empty {
                        <tr><td colspan="8" class="text-center text-muted-ar py-4">لا توجد أصناف مطابقة.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ng-template>
        </li>
        @if (canIssue()) {
          <li ngbNavItem="issue">
            <button ngbNavLink type="button">طلبات الصرف</button>
            <ng-template ngbNavContent><app-issue-queue /></ng-template>
          </li>
        }
        @if (canStockIn()) {
          <li ngbNavItem="in">
            <button ngbNavLink type="button">إدخال مخزون</button>
            <ng-template ngbNavContent><app-stock-in-form /></ng-template>
          </li>
        }
        @if (canAudit()) {
          <li ngbNavItem="count">
            <button ngbNavLink type="button">الجرد</button>
            <ng-template ngbNavContent><app-stock-count /></ng-template>
          </li>
        }
        <li ngbNavItem="moves">
          <button ngbNavLink type="button">حركة المخزون</button>
          <ng-template ngbNavContent><app-movements-log /></ng-template>
        </li>
      </ul>
      <div [ngbNavOutlet]="nav"></div>
    }
  `,
})
export class WarehousePageComponent {
  private readonly warehouse = inject(WarehouseService);
  private readonly permissions = inject(PermissionService);

  protected readonly tab = signal('stock');
  protected readonly filter = signal<Filter>('all');
  protected readonly filters: ReadonlyArray<{ key: Filter; label: string }> = [
    { key: 'all', label: 'الكل' },
    { key: 'low', label: 'منخفض' },
    { key: 'out', label: 'نفد' },
  ];
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges.pipe(startWith('')), { initialValue: '' });

  protected readonly canIssue = computed(() => this.permissions.can('warehouse.issue'));
  protected readonly canStockIn = computed(() => this.permissions.can('warehouse.stockin'));
  protected readonly canAudit = computed(() => this.permissions.can('warehouse.audit'));

  private readonly data = liveResource(
    () => ({}),
    () => this.warehouse.items(),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly items = computed(() => this.data.value() ?? []);
  protected readonly stockValue = computed(() => this.items().reduce((sum, i) => sum + i.stock * i.unitPrice, 0));

  protected count(level: StockLevel): number {
    return this.items().filter((i) => stockLevel(i) === level).length;
  }

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.items()
      .map((item) => ({ item, level: stockLevel(item), ui: LEVEL_UI[stockLevel(item)] }))
      .filter((r) => (this.filter() === 'all' ? true : this.filter() === 'out' ? r.level === 'out' : r.level !== 'ok'))
      .filter((r) => !q || r.item.nameAr.toLowerCase().includes(q) || r.item.code.toLowerCase().includes(q))
      .sort((a, b) => ['out', 'low', 'ok'].indexOf(a.level) - ['out', 'low', 'ok'].indexOf(b.level) || a.item.code.localeCompare(b.item.code));
  });
}
