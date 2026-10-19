import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PermissionService } from '../../core/rbac/permission.service';
import { BusAllocation } from '../../domain/bookings/booking-rules';
import { FULFILMENT_KEY, Fulfilment } from '../../domain/models/procurement';
import { Driver, RefLists, Vehicle, WarehouseItem } from '../../domain/models/reference';
import { ServiceRequest } from '../../domain/models/request';
import { ReferenceRepository } from '../../domain/repositories';
import { DETAIL_LABELS, EVENT_NEED_LABELS } from '../../domain/reference-data';
import { ArDatePipe, MoneyPipe, formatDate, formatDateTime } from '../../shared/pipes/format';
import { forkJoin } from 'rxjs';

interface Row {
  label: string;
  value: string;
  ltr?: boolean;
  /** Router link to the vehicle / driver file (only for users who may open it). */
  link?: unknown[];
}

interface AllocationRow {
  bus: string;
  driver: string;
  contracted: boolean;
}

interface ItemRow {
  description: string;
  unit: string;
  qty: number;
  price: number | null;
}

const DATE_KEYS = new Set(['violationDate', 'accidentDate', 'eventDate', 'tripDate']);
const LTR_KEYS = new Set(['plate', 'violationNo', 'tripCode', 'departTime', 'returnTime', 'linkedRequestRef', 'mapUrl', 'parentEventRef']);
const HIDDEN_KEYS = new Set(['items', 'withinRules', 'pledgeAccepted', 'vehicleId', 'driverId', 'confidential', 'linkedRequestId', 'waitlisted', 'allocation', 'forLines', 'fulfilment']);

/** Renders a request's service-specific `details` with Arabic labels, resolving reference ids to names. */
@Component({
  selector: 'app-request-details-view',
  imports: [ArDatePipe, MoneyPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="row g-3 mb-0">
      @for (row of rows(); track row.label) {
        <div class="col-sm-6">
          <dt class="small text-muted-ar fw-normal">{{ row.label }}</dt>
          <dd class="mb-0 fw-semibold">
            @if (row.link; as link) {
              <a [routerLink]="link" class="text-decoration-none"><span [class.ltr-inline]="row.ltr">{{ row.value }}</span> <i class="bi bi-box-arrow-up-left small" aria-hidden="true"></i></a>
            } @else if (row.ltr) {
              <span class="ltr-inline">{{ row.value }}</span>
            } @else {
              {{ row.value }}
            }
          </dd>
        </div>
      }
      <div class="col-12">
        <dt class="small text-muted-ar fw-normal">الوصف</dt>
        <dd class="mb-0">{{ request().descriptionAr }}</dd>
      </div>
      @if (request().neededBy) {
        <div class="col-sm-6">
          <dt class="small text-muted-ar fw-normal">التاريخ المطلوب</dt>
          <dd class="mb-0 fw-semibold"><span class="ltr-inline">{{ request().neededBy | arDate }}</span></dd>
        </div>
      }
      @if (request().estimatedValue > 0) {
        <div class="col-sm-6">
          <dt class="small text-muted-ar fw-normal">القيمة التقديرية</dt>
          <dd class="mb-0 fw-semibold">{{ request().estimatedValue | money }}</dd>
        </div>
      }
    </dl>

    @if (fulfilment(); as f) {
      @if (f.issued.length || f.awaiting.length) {
        <h3 class="h6 mt-4">الصرف من المستودع</h3>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead><tr><th scope="col">الصنف</th><th scope="col">الكمية</th><th scope="col">الحالة</th></tr></thead>
            <tbody>
              @for (l of f.issued; track l.itemId) {
                <tr><td>{{ l.nameAr }} <span class="text-muted-ar small ltr-inline">{{ l.code }}</span></td><td><span class="ltr-inline">{{ l.qty }}</span> {{ l.unitAr }}</td><td><span class="badge bg-success-subtle text-success-emphasis">صُرف</span></td></tr>
              }
              @for (l of f.awaiting; track l.itemId) {
                <tr><td>{{ l.nameAr }} <span class="text-muted-ar small ltr-inline">{{ l.code }}</span></td><td><span class="ltr-inline">{{ l.qty }}</span> {{ l.unitAr }}</td><td><span class="badge bg-warning-subtle text-warning-emphasis">بانتظار التوريد</span>@if (f.purchaseRef) { <span class="small text-muted-ar ltr-inline ms-1">{{ f.purchaseRef }}</span> }</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    }

    @if (allocation().length) {
      <h3 class="h6 mt-4">تخصيص الباصات والسائقين</h3>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead><tr><th scope="col">م</th><th scope="col">الباص</th><th scope="col">السائق</th></tr></thead>
          <tbody>
            @for (a of allocation(); track $index) {
              <tr>
                <td>{{ $index + 1 }}</td>
                <td>@if (a.contracted) { {{ a.bus }} } @else { <span class="ltr-inline">{{ a.bus }}</span> }</td>
                <td>{{ a.driver }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (items().length) {
      <h3 class="h6 mt-4">الأصناف</h3>
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead>
            <tr><th scope="col">م</th><th scope="col">الوصف</th><th scope="col">الوحدة</th><th scope="col">الكمية</th>@if (hasPrices()) { <th scope="col">السعر</th><th scope="col">الإجمالي</th> }</tr>
          </thead>
          <tbody>
            @for (it of items(); track $index) {
              <tr>
                <td>{{ $index + 1 }}</td>
                <td>{{ it.description }}</td>
                <td>{{ it.unit }}</td>
                <td><span class="ltr-inline">{{ it.qty }}</span></td>
                @if (hasPrices()) {
                  <td>{{ it.price | money }}</td>
                  <td>{{ (it.price ?? 0) * it.qty | money }}</td>
                }
              </tr>
            }
          </tbody>
          @if (hasPrices()) {
            <tfoot><tr class="fw-bold"><td colspan="5">الإجمالي التقديري</td><td>{{ itemsTotal() | money }}</td></tr></tfoot>
          }
        </table>
      </div>
    }
  `,
})
export class RequestDetailsViewComponent {
  private readonly reference = inject(ReferenceRepository);
  private readonly permissions = inject(PermissionService);

  readonly request = input.required<ServiceRequest>();

  private readonly lookups = rxResource({
    stream: () => forkJoin({ lists: this.reference.lists(), items: this.reference.items(), vehicles: this.reference.vehicles(), drivers: this.reference.drivers() }),
  });

  protected readonly rows = computed<Row[]>(() => {
    const details = this.request().details;
    const lists: RefLists | undefined = this.lookups.value()?.lists;
    const out: Row[] = [];
    for (const [key, raw] of Object.entries(details)) {
      if (HIDDEN_KEYS.has(key) || raw === undefined || raw === null || raw === '') continue;
      const label = DETAIL_LABELS[key];
      if (!label) continue;
      out.push({ label, value: this.format(key, raw, lists), ltr: LTR_KEYS.has(key), link: this.fileLink(key, details) });
    }
    return out;
  });

  protected readonly items = computed<ItemRow[]>(() => {
    const raw = this.request().details['items'];
    if (!Array.isArray(raw)) return [];
    const catalog: WarehouseItem[] = this.lookups.value()?.items ?? [];
    return raw.map((i: Record<string, unknown>) => {
      if (typeof i['itemId'] === 'string') {
        const item = catalog.find((c) => c.id === i['itemId']);
        return { description: item ? `${item.nameAr} (${item.code})` : String(i['itemId']), unit: item?.unitAr ?? '', qty: Number(i['qty']), price: null };
      }
      return { description: String(i['description'] ?? ''), unit: String(i['unit'] ?? ''), qty: Number(i['qty']), price: Number(i['price']) };
    });
  });

  protected readonly fulfilment = computed(() => this.request().details[FULFILMENT_KEY] as Fulfilment | undefined);

  /** Bus slots of a bus booking, with plates and driver names resolved. */
  protected readonly allocation = computed<AllocationRow[]>(() => {
    const slots = (this.request().details['allocation'] as BusAllocation | undefined)?.slots ?? [];
    const vehicles: Vehicle[] = this.lookups.value()?.vehicles ?? [];
    const drivers: Driver[] = this.lookups.value()?.drivers ?? [];
    return slots.map((s) =>
      s.vehicleId
        ? { bus: vehicles.find((v) => v.id === s.vehicleId)?.plate ?? '—', driver: drivers.find((d) => d.id === s.driverId)?.nameAr ?? '—', contracted: false }
        : { bus: 'باص متعاقد (خارجي)', driver: 'سائق الجهة المتعاقدة', contracted: true },
    );
  });

  protected readonly hasPrices = computed(() => this.items().some((i) => i.price !== null));
  protected readonly itemsTotal = computed(() => this.items().reduce((sum, i) => sum + (i.price ?? 0) * i.qty, 0));

  /** Plate and driver rows link to the vehicle / driver file for users who can open it. */
  private fileLink(key: string, details: Record<string, unknown>): unknown[] | undefined {
    if (key === 'plate' && typeof details['vehicleId'] === 'string' && this.permissions.can('fleet.vehicle.view')) return ['/fleet/vehicles', details['vehicleId']];
    if (key === 'driverName' && typeof details['driverId'] === 'string' && this.permissions.can('fleet.driver.view')) return ['/fleet/drivers', details['driverId']];
    return undefined;
  }

  private format(key: string, raw: unknown, lists: RefLists | undefined): string {
    if (typeof raw === 'boolean') return raw ? 'نعم' : 'لا';
    if (DATE_KEYS.has(key)) return formatDate(String(raw));
    if (key === 'pledgeAt') return formatDateTime(String(raw));
    if (key === 'needs' && Array.isArray(raw)) return raw.map((n) => EVENT_NEED_LABELS[String(n)] ?? String(n)).join('، ');
    const lookup = (list: { id: string; nameAr: string }[] | undefined) => list?.find((x) => x.id === raw)?.nameAr ?? String(raw);
    switch (key) {
      case 'specialty':
        return lookup(lists?.maintenanceSpecialties);
      case 'maintenanceTypeId':
        return lookup(lists?.vehicleMaintenanceTypes);
      case 'purposeId':
        return lookup(lists?.tripPurposes);
      case 'categoryId':
        return lookup(lists?.complaintCategories);
      case 'najmReportAttached':
        return 'مرفق';
      default:
        return String(raw);
    }
  }
}
