import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { liveResource } from '../../core/live-resource';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { BRANCHES } from '../../domain/reference-data';
import { ReferenceRepository } from '../../domain/repositories';
import { ArDatePipe, MoneyPipe } from '../../shared/pipes/format';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { FLEET_SERVICES, forDriver, forVehicle, summarize, topIds } from './fleet-stats';

const VEHICLE_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'في الخدمة', cls: 'bg-success-subtle text-success-emphasis' },
  in_workshop: { label: 'في الورشة', cls: 'bg-warning-subtle text-warning-emphasis' },
  retired: { label: 'خارج الخدمة', cls: 'bg-secondary-subtle text-secondary-emphasis' },
};

/** الورشة المركزية: fleet overview with the vehicle and driver files, highlighting the costliest vehicles and most-violating drivers. */
@Component({
  selector: 'app-fleet-page',
  imports: [RouterLink, NgbNavModule, ArDatePipe, MoneyPipe, PageHeaderComponent, SkeletonRowsComponent, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="الورشة المركزية" subtitle="ملفات المركبات والسائقين: الصيانة والمخالفات والحوادث والتكلفة التراكمية" />

    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="6" /></div></div>
    } @else {
      <div class="row g-3 mb-4">
        <div class="col-6 col-xl-3"><app-stat-card label="المركبات" [value]="vehicleRows().length" icon="bi-truck" tone="primary" [hint]="inWorkshop() + ' في الورشة'" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="تكلفة الصيانة" [value]="(totals().maintenanceCost | money)" icon="bi-wrench-adjustable" tone="info" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="قيمة المخالفات" [value]="(totals().fines | money)" icon="bi-camera-video" tone="warning" [hint]="totals().violations + ' مخالفات'" /></div>
        <div class="col-6 col-xl-3"><app-stat-card label="الحوادث" [value]="totals().accidents" icon="bi-exclamation-triangle" tone="danger" [hint]="totals().open + ' طلب مفتوح'" /></div>
      </div>

      <ul ngbNav #nav="ngbNav" class="nav-tabs mb-3" [(activeId)]="tab">
        @if (canVehicles()) {
          <li ngbNavItem="vehicles">
            <button ngbNavLink type="button">المركبات</button>
            <ng-template ngbNavContent>
              <div class="card">
                <div class="table-responsive">
                  <table class="table table-hover align-middle mb-0">
                    <caption class="visually-hidden">مركبات الأسطول</caption>
                    <thead>
                      <tr>
                        <th scope="col">المركبة</th>
                        <th scope="col">الفرع</th>
                        <th scope="col">الحالة</th>
                        <th scope="col">العداد (كم)</th>
                        <th scope="col">الصيانة الوقائية القادمة</th>
                        <th scope="col">صيانة</th>
                        <th scope="col">مخالفات</th>
                        <th scope="col">حوادث</th>
                        <th scope="col">التكلفة التراكمية</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of vehicleRows(); track row.vehicle.id) {
                        <tr>
                          <td>
                            <a [routerLink]="['/fleet/vehicles', row.vehicle.id]" class="fw-semibold text-decoration-none"><span class="ltr-inline">{{ row.vehicle.plate }}</span></a>
                            <div class="small text-muted-ar">{{ row.vehicle.typeAr }}</div>
                          </td>
                          <td>{{ row.branch }}</td>
                          <td><span class="badge" [class]="row.status.cls">{{ row.status.label }}</span></td>
                          <td><span class="ltr-inline">{{ row.vehicle.mileage }}</span></td>
                          <td><span class="ltr-inline">{{ row.vehicle.nextPreventiveDate | arDate }}</span></td>
                          <td><span class="ltr-inline">{{ row.stats.maintenance }}</span></td>
                          <td><span class="ltr-inline">{{ row.stats.violations }}</span></td>
                          <td><span class="ltr-inline">{{ row.stats.accidents }}</span></td>
                          <td>
                            {{ row.stats.total | money }}
                            @if (row.costly) {
                              <span class="badge bg-danger-subtle text-danger-emphasis ms-1"><i class="bi bi-arrow-up-circle me-1" aria-hidden="true"></i>الأعلى تكلفة</span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </ng-template>
          </li>
        }
        @if (canDrivers()) {
          <li ngbNavItem="drivers">
            <button ngbNavLink type="button">السائقون</button>
            <ng-template ngbNavContent>
              <div class="card">
                <div class="table-responsive">
                  <table class="table table-hover align-middle mb-0">
                    <caption class="visually-hidden">سائقو الأسطول</caption>
                    <thead>
                      <tr>
                        <th scope="col">السائق</th>
                        <th scope="col">الفرع</th>
                        <th scope="col">رقم الرخصة</th>
                        <th scope="col">الحالة</th>
                        <th scope="col">مخالفات</th>
                        <th scope="col">قيمة المخالفات</th>
                        <th scope="col">حوادث</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of driverRows(); track row.driver.id) {
                        <tr>
                          <td>
                            <a [routerLink]="['/fleet/drivers', row.driver.id]" class="fw-semibold text-decoration-none">{{ row.driver.nameAr }}</a>
                            <div class="small text-muted-ar"><span class="ltr-inline">{{ row.driver.mobile }}</span></div>
                          </td>
                          <td>{{ row.branch }}</td>
                          <td><span class="ltr-inline">{{ row.driver.licenseNo }}</span></td>
                          <td>
                            <span class="badge" [class]="row.driver.active ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'">{{ row.driver.active ? 'على رأس العمل' : 'متوقف' }}</span>
                          </td>
                          <td>
                            <span class="ltr-inline">{{ row.stats.violations }}</span>
                            @if (row.repeat) {
                              <span class="badge bg-danger-subtle text-danger-emphasis ms-1"><i class="bi bi-arrow-up-circle me-1" aria-hidden="true"></i>الأكثر مخالفات</span>
                            }
                          </td>
                          <td>{{ row.stats.fines | money }}</td>
                          <td><span class="ltr-inline">{{ row.stats.accidents }}</span></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </ng-template>
          </li>
        }
      </ul>
      <div [ngbNavOutlet]="nav"></div>
    }
  `,
})
export class FleetPageComponent {
  private readonly requests = inject(RequestService);
  private readonly reference = inject(ReferenceRepository);
  private readonly permissions = inject(PermissionService);
  private readonly auth = inject(AuthService);

  protected readonly tab = signal(this.permissions.can('fleet.vehicle.view') ? 'vehicles' : 'drivers');
  protected readonly canVehicles = computed(() => this.permissions.can('fleet.vehicle.view'));
  protected readonly canDrivers = computed(() => this.permissions.can('fleet.driver.view'));

  private readonly data = liveResource(
    () => ({ user: this.auth.currentUser()?.id ?? null }),
    () => forkJoin({ requests: this.requests.list(), vehicles: this.reference.vehicles(), drivers: this.reference.drivers() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  private readonly fleetRequests = computed(() => (this.data.value()?.requests ?? []).filter((r) => FLEET_SERVICES.includes(r.service)));
  protected readonly totals = computed(() => summarize(this.fleetRequests()));

  protected readonly vehicleRows = computed(() => {
    const vehicles = this.data.value()?.vehicles ?? [];
    const rows = vehicles.map((vehicle) => ({
      vehicle,
      stats: summarize(forVehicle(this.fleetRequests(), vehicle.id)),
      branch: BRANCHES.find((b) => b.id === vehicle.branchId)?.nameAr ?? 'مركزي',
      status: VEHICLE_STATUS[vehicle.status],
    }));
    const top = topIds(rows.map((r) => ({ id: r.vehicle.id, value: r.stats.total })));
    return rows.map((r) => ({ ...r, costly: top.has(r.vehicle.id) }));
  });

  protected readonly inWorkshop = computed(() => this.vehicleRows().filter((r) => r.vehicle.status === 'in_workshop').length);

  protected readonly driverRows = computed(() => {
    const drivers = this.data.value()?.drivers ?? [];
    const rows = drivers.map((driver) => ({
      driver,
      stats: summarize(forDriver(this.fleetRequests(), driver.id)),
      branch: BRANCHES.find((b) => b.id === driver.branchId)?.nameAr ?? 'مركزي',
    }));
    const top = topIds(rows.map((r) => ({ id: r.driver.id, value: r.stats.violations })), 3, 2);
    return rows.map((r) => ({ ...r, repeat: top.has(r.driver.id) }));
  });
}
