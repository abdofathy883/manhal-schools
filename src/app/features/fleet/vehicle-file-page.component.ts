import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { BookingService } from '../../core/bookings/booking.service';
import { liveResource } from '../../core/live-resource';
import { RequestService } from '../../core/requests/request.service';
import { BRANCHES } from '../../domain/reference-data';
import { ReferenceRepository } from '../../domain/repositories';
import { ArDatePipe, formatMoney } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { FleetRecordsTableComponent } from './fleet-records-table.component';
import { forVehicle, summarize } from './fleet-stats';

const STATUS_LABELS: Record<string, string> = { active: 'في الخدمة', in_workshop: 'في الورشة', retired: 'خارج الخدمة' };
const minutes = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** ملف المركبة: data, maintenance, violations, accidents, cumulative cost and the bus trips it was allocated to. */
@Component({
  selector: 'app-vehicle-file-page',
  imports: [RouterLink, ArDatePipe, EmptyStateComponent, PageHeaderComponent, SkeletonRowsComponent, StatCardComponent, FleetRecordsTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="6" /></div></div>
    } @else if (vehicle(); as v) {
      <app-page-header [title]="'ملف المركبة: ' + v.plate" [subtitle]="v.typeAr">
        <a class="btn btn-outline-secondary" routerLink="/fleet"><i class="bi bi-arrow-right me-1" aria-hidden="true"></i>رجوع للورشة المركزية</a>
      </app-page-header>

      <div class="row g-3 mb-4">
        <div class="col-6 col-xl-3"><app-stat-card label="طلبات الصيانة" [value]="stats().maintenance" icon="bi-wrench-adjustable" tone="info" [hint]="money(stats().maintenanceCost)" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="المخالفات" [value]="stats().violations" icon="bi-camera-video" tone="warning" [hint]="money(stats().fines)" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="الحوادث" [value]="stats().accidents" icon="bi-exclamation-triangle" tone="danger" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="التكلفة التراكمية" [value]="money(stats().total)" icon="bi-cash-coin" tone="primary" hint="الصيانة + المخالفات" /></div>
      </div>

      <div class="row g-4">
        <div class="col-lg-4">
          <section class="card mb-4">
            <div class="card-header">بيانات المركبة</div>
            <dl class="list-group list-group-flush mb-0">
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">رقم اللوحة</dt><dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ v.plate }}</span></dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الفرع</dt><dd class="mb-0 fw-semibold">{{ branch() }}</dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الحالة</dt><dd class="mb-0 fw-semibold">{{ statusLabel() }}</dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">العداد (كم)</dt><dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ v.mileage }}</span></dd></div>
              @if (v.seats) {
                <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">المقاعد</dt><dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ v.seats }}</span></dd></div>
              }
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الصيانة الوقائية القادمة</dt><dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ v.nextPreventiveDate | arDate }}</span></dd></div>
            </dl>
          </section>

          <section class="card mb-4">
            <div class="card-header">رحلات الباص المخصصة</div>
            @if (trips().length) {
              <ul class="list-group list-group-flush">
                @for (t of trips(); track t.id) {
                  <li class="list-group-item d-flex justify-content-between gap-2">
                    <span><span class="ltr-inline">{{ t.date | arDate }}</span></span>
                    <span class="text-muted-ar"><span class="ltr-inline">{{ t.from }} – {{ t.to }}</span> · {{ t.branch }}</span>
                  </li>
                }
              </ul>
            } @else {
              <div class="card-body text-muted-ar">لا توجد رحلات مخصصة لهذه المركبة.</div>
            }
          </section>
        </div>

        <div class="col-lg-8">
          <app-fleet-records-table title="طلبات الصيانة" [rows]="maintenance()" />
          <app-fleet-records-table title="المخالفات المرورية" [rows]="violations()" amountLabel="المبلغ" kind="fine" />
          <app-fleet-records-table title="الحوادث المرورية" [rows]="accidents()" />
        </div>
      </div>
    } @else {
      <div class="card"><app-empty-state title="المركبة غير موجودة" message="تأكد من الرابط.">
        <a routerLink="/fleet" class="btn btn-primary">الورشة المركزية</a>
      </app-empty-state></div>
    }
  `,
})
export class VehicleFilePageComponent {
  private readonly requests = inject(RequestService);
  private readonly reference = inject(ReferenceRepository);
  private readonly bookings = inject(BookingService);
  private readonly auth = inject(AuthService);

  /** Route param `:id`. */
  readonly id = input.required<string>();

  private readonly data = liveResource(
    () => ({ id: this.id(), user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ requests: this.requests.list(), vehicles: this.reference.vehicles(), occupancy: this.bookings.occupancy() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  protected readonly vehicle = computed(() => this.data.value()?.vehicles.find((v) => v.id === this.id()) ?? null);
  private readonly mine = computed(() => forVehicle(this.data.value()?.requests ?? [], this.id()));
  protected readonly stats = computed(() => summarize(this.mine()));
  protected readonly maintenance = computed(() => this.mine().filter((r) => r.service === 'vehicle-maintenance'));
  protected readonly violations = computed(() => this.mine().filter((r) => r.service === 'traffic-violation'));
  protected readonly accidents = computed(() => this.mine().filter((r) => r.service === 'traffic-accident'));
  protected readonly branch = computed(() => BRANCHES.find((b) => b.id === this.vehicle()?.branchId)?.nameAr ?? 'مركزي');
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.vehicle()?.status ?? 'active']);

  protected readonly trips = computed(() =>
    (this.data.value()?.occupancy ?? [])
      .filter((o) => o.vehicleIds.includes(this.id()))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((o) => ({ id: o.id, date: o.date, from: minutes(o.departMin), to: minutes(o.returnMin), branch: BRANCHES.find((b) => b.id === o.branchId)?.nameAr ?? '' })),
  );

  protected readonly money = formatMoney;
}
