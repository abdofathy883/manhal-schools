import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AdminService, UsageKind } from '../../../core/admin/admin.service';
import { liveResource } from '../../../core/live-resource';
import { Driver, RefListItem, RefLists, Supplier, Vehicle } from '../../../domain/models/reference';
import { BRANCHES } from '../../../domain/reference-data';
import { ReferenceRepository } from '../../../domain/repositories';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../../shared/ui/skeleton-rows.component';
import { FieldDef, Row } from './crud-dialog.component';
import { CrudChange, CrudTableComponent } from './crud-table.component';

type ListKey = 'maintenanceSpecialties' | 'vehicleMaintenanceTypes' | 'tripPurposes' | 'complaintCategories';

const LISTS: ReadonlyArray<{ key: ListKey; id: string; singular: string; plural: string; prefix: string }> = [
  { key: 'maintenanceSpecialties', id: 'sp', singular: 'تخصص', plural: 'تخصصات الصيانة', prefix: 'sp' },
  { key: 'vehicleMaintenanceTypes', id: 'vm', singular: 'نوع صيانة', plural: 'أنواع صيانة المركبات', prefix: 'vm' },
  { key: 'tripPurposes', id: 'tp', singular: 'غرض رحلة', plural: 'أغراض الرحلات', prefix: 'tp' },
  { key: 'complaintCategories', id: 'cc', singular: 'تصنيف', plural: 'تصنيفات الشكاوى', prefix: 'cc' },
];

const NAME_FIELD: readonly FieldDef[] = [{ key: 'nameAr', label: 'الاسم', type: 'text', required: true }];

const branchOptions = [{ value: '', label: 'مركزي' }, ...BRANCHES.map((b) => ({ value: b.id, label: b.nameAr }))];

const VEHICLE_FIELDS: readonly FieldDef[] = [
  { key: 'plate', label: 'رقم اللوحة', type: 'text', required: true, ltr: true },
  { key: 'typeAr', label: 'النوع', type: 'text', required: true },
  { key: 'branchId', label: 'الفرع', type: 'select', options: branchOptions },
  { key: 'mileage', label: 'العداد (كم)', type: 'number', required: true, min: 0, default: 0 },
  {
    key: 'status',
    label: 'الحالة',
    type: 'select',
    required: true,
    default: 'active',
    options: [
      { value: 'active', label: 'في الخدمة' },
      { value: 'in_workshop', label: 'في الورشة' },
      { value: 'retired', label: 'خارج الخدمة' },
    ],
  },
  { key: 'seats', label: 'المقاعد', type: 'number', min: 1 },
  { key: 'nextPreventiveDate', label: 'الصيانة الوقائية القادمة', type: 'date' },
];

const DRIVER_FIELDS: readonly FieldDef[] = [
  { key: 'nameAr', label: 'الاسم', type: 'text', required: true },
  { key: 'mobile', label: 'الجوال', type: 'text', required: true, ltr: true, pattern: /^05\d{8}$/, patternMessage: '05 ثم 8 أرقام.' },
  { key: 'licenseNo', label: 'رقم الرخصة', type: 'text', required: true, ltr: true, pattern: /^\d{10}$/, patternMessage: 'عشرة أرقام.' },
  { key: 'branchId', label: 'الفرع', type: 'select', options: branchOptions },
  { key: 'active', label: 'على رأس العمل', type: 'bool', default: true },
];

const SUPPLIER_FIELDS: readonly FieldDef[] = [
  { key: 'nameAr', label: 'اسم المورد', type: 'text', required: true },
  { key: 'contactAr', label: 'جهة الاتصال', type: 'text', required: true },
  { key: 'mobile', label: 'الجوال', type: 'text', required: true, ltr: true, pattern: /^05\d{8}$/, patternMessage: '05 ثم 8 أرقام.' },
];

/** `/admin/reference`: the lists every form draws on (specialties, types, purposes, categories, vehicles, drivers, suppliers). */
@Component({
  selector: 'app-reference-page',
  imports: [NgbNavModule, RouterLink, PageHeaderComponent, SkeletonRowsComponent, CrudTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  template: `
    <app-page-header title="البيانات المرجعية" subtitle="القوائم التي تعتمد عليها النماذج في كل الخدمات؛ التعديل ينعكس فورًا دون تكرار القوائم" />

    @if (loading()) {
      <div class="card"><div class="card-body"><app-skeleton-rows [count]="6" /></div></div>
    } @else {
      <ul ngbNav #nav="ngbNav" [(activeId)]="tab" class="nav-tabs mb-3">
        @for (l of lists; track l.key) {
          <li [ngbNavItem]="l.key">
            <button ngbNavLink type="button">{{ l.plural }}</button>
            <ng-template ngbNavContent>
              <app-crud-table
                [rows]="listRows(l.key)"
                [fields]="nameField"
                [singular]="l.singular"
                [plural]="l.plural"
                [idPrefix]="l.prefix"
                [usage]="usageFns[l.key]"
                [save]="listSavers[l.key]"
              />
            </ng-template>
          </li>
        }
        <li ngbNavItem="vehicles">
          <button ngbNavLink type="button">المركبات</button>
          <ng-template ngbNavContent>
            <app-crud-table [rows]="vehicleRows()" [fields]="vehicleFields" singular="مركبة" plural="المركبات" idPrefix="v" [usage]="usageFns.vehicles" [save]="saveVehicles" />
          </ng-template>
        </li>
        <li ngbNavItem="drivers">
          <button ngbNavLink type="button">السائقون</button>
          <ng-template ngbNavContent>
            <app-crud-table [rows]="driverRows()" [fields]="driverFields" singular="سائق" plural="السائقون" idPrefix="d" [usage]="usageFns.drivers" [save]="saveDrivers" />
          </ng-template>
        </li>
        <li ngbNavItem="suppliers">
          <button ngbNavLink type="button">الموردون</button>
          <ng-template ngbNavContent>
            <app-crud-table [rows]="supplierRows()" [fields]="supplierFields" singular="مورد" plural="الموردون" idPrefix="s" [usage]="usageFns.suppliers" [save]="saveSuppliers" />
          </ng-template>
        </li>
      </ul>
      <div [ngbNavOutlet]="nav"></div>
      <p class="small text-muted-ar mt-3">
        أيام الحجب في تقويم الباصات تُدار من <a routerLink="/transport">شاشة النقل</a>، وأرصدة المستودع من شاشة المستودع.
      </p>
    }
  `,
})
export class ReferencePageComponent {
  private readonly admin = inject(AdminService);
  private readonly reference = inject(ReferenceRepository);

  protected readonly tab = signal<string>('maintenanceSpecialties');
  protected readonly lists = LISTS;
  protected readonly nameField = NAME_FIELD;
  protected readonly vehicleFields = VEHICLE_FIELDS;
  protected readonly driverFields = DRIVER_FIELDS;
  protected readonly supplierFields = SUPPLIER_FIELDS;

  private readonly data = liveResource(
    () => ({}),
    () => forkJoin({ lists: this.reference.lists(), vehicles: this.reference.vehicles(), drivers: this.reference.drivers(), suppliers: this.reference.suppliers() }),
  );
  protected readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());

  protected readonly vehicleRows = computed(() => (this.data.value()?.vehicles ?? []).map((v) => ({ ...v, branchId: v.branchId ?? '' }) as unknown as Row));
  protected readonly driverRows = computed(() => (this.data.value()?.drivers ?? []).map((d) => ({ ...d, branchId: d.branchId ?? '' }) as unknown as Row));
  protected readonly supplierRows = computed(() => (this.data.value()?.suppliers ?? []) as unknown as Row[]);

  protected listRows(key: ListKey): Row[] {
    return (this.data.value()?.lists[key] ?? []) as unknown as Row[];
  }

  /** Stable function instances (inputs must not change identity on every change-detection pass). */
  protected readonly usageFns: Record<UsageKind, (id: string) => ReturnType<AdminService['usage']>> = {
    maintenanceSpecialties: (id) => this.admin.usage('maintenanceSpecialties', id),
    vehicleMaintenanceTypes: (id) => this.admin.usage('vehicleMaintenanceTypes', id),
    tripPurposes: (id) => this.admin.usage('tripPurposes', id),
    complaintCategories: (id) => this.admin.usage('complaintCategories', id),
    vehicles: (id) => this.admin.usage('vehicles', id),
    drivers: (id) => this.admin.usage('drivers', id),
    suppliers: (id) => this.admin.usage('suppliers', id),
  };

  protected readonly listSavers = Object.fromEntries(
    LISTS.map((l) => [
      l.key,
      (c: CrudChange) => {
        const lists = this.data.value()!.lists as RefLists;
        return this.admin.saveLists({ ...lists, [l.key]: c.next as unknown as RefListItem[] }, `${l.plural}: ${c.summaryAr}`);
      },
    ]),
  ) as Record<ListKey, (c: CrudChange) => ReturnType<AdminService['saveLists']>>;

  protected readonly saveVehicles = (c: CrudChange) =>
    this.admin.saveVehicles(
      (c.next as unknown as Array<Vehicle & { branchId: string | null }>).map((v) => ({ ...v, branchId: v.branchId || null })),
      c.summaryAr,
    );

  protected readonly saveDrivers = (c: CrudChange) =>
    this.admin.saveDrivers(
      (c.next as unknown as Array<Driver & { branchId: string | null }>).map((d) => ({ ...d, branchId: d.branchId || null })),
      c.summaryAr,
    );

  protected readonly saveSuppliers = (c: CrudChange) => this.admin.saveSuppliers(c.next as unknown as Supplier[], c.summaryAr);
}
