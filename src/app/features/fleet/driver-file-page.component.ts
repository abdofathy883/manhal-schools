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
import { forDriver, summarize } from './fleet-stats';

const minutes = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** ملف السائق: licence, violations, accidents, vehicles driven and bus trips. */
@Component({
  selector: 'app-driver-file-page',
  imports: [RouterLink, ArDatePipe, EmptyStateComponent, PageHeaderComponent, SkeletonRowsComponent, StatCardComponent, FleetRecordsTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="6" /></div></div>
    } @else if (driver(); as d) {
      <app-page-header [title]="'ملف السائق: ' + d.nameAr" [subtitle]="branch()">
        <a class="btn btn-outline-secondary" routerLink="/fleet"><i class="bi bi-arrow-right me-1" aria-hidden="true"></i>رجوع للورشة المركزية</a>
      </app-page-header>

      <div class="row g-3 mb-4">
        <div class="col-6 col-xl-3"><app-stat-card label="المخالفات" [value]="stats().violations" icon="bi-camera-video" tone="warning" [hint]="money(stats().fines)" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="الحوادث" [value]="stats().accidents" icon="bi-exclamation-triangle" tone="danger" [hint]="stats().avgFaultPercent === null ? '' : 'متوسط نسبة الخطأ ' + stats().avgFaultPercent + '%'" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="مركبات قادها" [value]="vehicleCount()" icon="bi-truck" tone="info" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="رحلات مخصصة" [value]="trips().length" icon="bi-bus-front" tone="primary" /></div>
      </div>

      <div class="row g-4">
        <div class="col-lg-4">
          <section class="card mb-4">
            <div class="card-header">بيانات السائق</div>
            <dl class="list-group list-group-flush mb-0">
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الاسم</dt><dd class="mb-0 fw-semibold">{{ d.nameAr }}</dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الجوال</dt><dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ d.mobile }}</span></dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">رقم الرخصة</dt><dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ d.licenseNo }}</span></dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الفرع</dt><dd class="mb-0 fw-semibold">{{ branch() }}</dd></div>
              <div class="list-group-item d-flex justify-content-between"><dt class="fw-normal text-muted-ar">الحالة</dt><dd class="mb-0 fw-semibold">{{ d.active ? 'على رأس العمل' : 'متوقف' }}</dd></div>
            </dl>
          </section>

          <section class="card mb-4">
            <div class="card-header">الرحلات المخصصة</div>
            @if (trips().length) {
              <ul class="list-group list-group-flush">
                @for (t of trips(); track t.id) {
                  <li class="list-group-item d-flex justify-content-between gap-2">
                    <span class="ltr-inline">{{ t.date | arDate }}</span>
                    <span class="text-muted-ar"><span class="ltr-inline">{{ t.from }} – {{ t.to }}</span></span>
                  </li>
                }
              </ul>
            } @else {
              <div class="card-body text-muted-ar">لا توجد رحلات مخصصة لهذا السائق.</div>
            }
          </section>
        </div>

        <div class="col-lg-8">
          <app-fleet-records-table title="المخالفات المرورية" [rows]="violations()" amountLabel="المبلغ" kind="fine" />
          <app-fleet-records-table title="الحوادث المرورية" [rows]="accidents()" />
          <app-fleet-records-table title="طلبات صيانة على مركبات قادها" [rows]="maintenance()" />
        </div>
      </div>
    } @else {
      <div class="card"><app-empty-state title="السائق غير موجود" message="تأكد من الرابط.">
        <a routerLink="/fleet" class="btn btn-primary">الورشة المركزية</a>
      </app-empty-state></div>
    }
  `,
})
export class DriverFilePageComponent {
  private readonly requests = inject(RequestService);
  private readonly reference = inject(ReferenceRepository);
  private readonly bookings = inject(BookingService);
  private readonly auth = inject(AuthService);

  /** Route param `:id`. */
  readonly id = input.required<string>();

  private readonly data = liveResource(
    () => ({ id: this.id(), user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ requests: this.requests.list(), drivers: this.reference.drivers(), occupancy: this.bookings.occupancy() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  protected readonly driver = computed(() => this.data.value()?.drivers.find((d) => d.id === this.id()) ?? null);
  private readonly mine = computed(() => forDriver(this.data.value()?.requests ?? [], this.id()));
  protected readonly stats = computed(() => summarize(this.mine()));
  protected readonly violations = computed(() => this.mine().filter((r) => r.service === 'traffic-violation'));
  protected readonly accidents = computed(() => this.mine().filter((r) => r.service === 'traffic-accident'));
  protected readonly maintenance = computed(() => this.mine().filter((r) => r.service === 'vehicle-maintenance'));
  protected readonly vehicleCount = computed(() => new Set(this.mine().map((r) => r.details['vehicleId'])).size);
  protected readonly branch = computed(() => BRANCHES.find((b) => b.id === this.driver()?.branchId)?.nameAr ?? 'مركزي');

  protected readonly trips = computed(() =>
    (this.data.value()?.occupancy ?? [])
      .filter((o) => o.driverIds.includes(this.id()))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((o) => ({ id: o.id, date: o.date, from: minutes(o.departMin), to: minutes(o.returnMin) })),
  );

  protected readonly money = formatMoney;
}
