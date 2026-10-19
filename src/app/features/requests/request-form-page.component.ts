import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgbDatepickerModule, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap/datepicker';
import { AuthService } from '../../core/auth/auth.service';
import { BookingService } from '../../core/bookings/booking.service';
import { ToastService } from '../../core/notifications/toast.service';
import { PermissionService } from '../../core/rbac/permission.service';
import { RequestService } from '../../core/requests/request.service';
import { AttachmentMeta, Priority, ServiceKey } from '../../domain/models/request';
import {
  BRANCHES,
  COMMON_PRIORITIES,
  DEPARTMENTS,
  MAINTENANCE_PRIORITIES,
  PRIORITY_LABELS,
  REQUEST_TEMPLATES,
  SERVICE_BY_KEY,
} from '../../domain/reference-data';
import { RequestDraft } from '../../domain/workflows/engine';
import { AttachmentUploaderComponent } from '../../shared/ui/attachment-uploader.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { BuildingMaintenanceSectionComponent } from './sections/building-maintenance-section.component';
import { BusBookingSectionComponent } from './sections/bus-booking-section.component';
import { ComplaintSectionComponent } from './sections/complaint-section.component';
import { InternalEventSectionComponent } from './sections/internal-event-section.component';
import { itemsTotal } from './sections/items-table.component';
import { PurchaseRequestSectionComponent } from './sections/purchase-request-section.component';
import { DetailsGroup } from './sections/section-base';
import { TrafficAccidentSectionComponent } from './sections/traffic-accident-section.component';
import { TrafficViolationSectionComponent } from './sections/traffic-violation-section.component';
import { VehicleMaintenanceSectionComponent } from './sections/vehicle-maintenance-section.component';
import { WarehouseNeedSectionComponent } from './sections/warehouse-need-section.component';
import { WorksExecutionSectionComponent } from './sections/works-execution-section.component';

const MAINTENANCE_SERVICES: readonly ServiceKey[] = ['building-maintenance', 'works-execution', 'vehicle-maintenance'];
/** Services where the requester types the estimated value (purchases take it from the items table). */
const VALUE_SERVICES: readonly ServiceKey[] = ['works-execution'];
/** Services that have no priority / needed-by date in the form. */
const NO_SCHEDULING: readonly ServiceKey[] = ['complaint', 'bus-booking', 'internal-event', 'traffic-violation', 'traffic-accident'];

const toIsoDate = (d: NgbDateStruct): string =>
  new Date(Date.UTC(d.year, d.month - 1, d.day, 12)).toISOString();

/** Common request header (requester, branch/department, priority, needed-by, title, details, attachments). */
@Component({
  selector: 'app-request-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgbDatepickerModule,
    PageHeaderComponent,
    AttachmentUploaderComponent,
    BuildingMaintenanceSectionComponent,
    WorksExecutionSectionComponent,
    PurchaseRequestSectionComponent,
    WarehouseNeedSectionComponent,
    ComplaintSectionComponent,
    VehicleMaintenanceSectionComponent,
    TrafficViolationSectionComponent,
    TrafficAccidentSectionComponent,
    InternalEventSectionComponent,
    BusBookingSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block page-enter' },
  templateUrl: './request-form-page.component.html',
})
export class RequestFormPageComponent {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly requests = inject(RequestService);
  private readonly bookings = inject(BookingService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  /** Route params / query params (router input binding). */
  readonly service = input.required<ServiceKey>();
  readonly template = input<string | undefined>();

  protected readonly user = this.auth.currentUser;
  protected readonly branches = BRANCHES;
  protected readonly departments = DEPARTMENTS;
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly attachments = signal<AttachmentMeta[]>([]);

  protected readonly definition = computed(() => SERVICE_BY_KEY[this.service()]);
  protected readonly allowed = computed(() => this.permissions.can(this.definition().createPermission));
  protected readonly priorities = computed<readonly Priority[]>(() =>
    MAINTENANCE_SERVICES.includes(this.service()) ? MAINTENANCE_PRIORITIES : COMMON_PRIORITIES,
  );
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly needsValue = computed(() => VALUE_SERVICES.includes(this.service()));
  protected readonly hasScheduling = computed(() => !NO_SCHEDULING.includes(this.service()));
  /** Service-specific controls are added to this group by the section components. */
  protected readonly details: DetailsGroup = new FormGroup<Record<string, AbstractControl>>({});
  /** Central staff have no branch/department of their own, so they pick them. */
  protected readonly pickPlace = computed(() => !this.user()?.branchId);
  /** Branch the request belongs to: the user's own, or the one central staff pick (used by the bus calendar). */
  private readonly pickedBranch = signal<string | null>(null);
  protected readonly effectiveBranchId = computed(() => (this.pickPlace() ? this.pickedBranch() : (this.user()?.branchId ?? null)));

  protected readonly form = new FormGroup({
    mobile: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^05\d{8}$/)] }),
    branchId: new FormControl<string | null>(null),
    departmentId: new FormControl<string | null>(null),
    priority: new FormControl<Priority>('normal', { nonNullable: true }),
    neededBy: new FormControl<NgbDateStruct | null>(null),
    titleAr: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    descriptionAr: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10)] }),
    estimatedValue: new FormControl<number | null>(null),
  });

  private templateDetails: Record<string, unknown> = {};

  constructor() {
    effect(() => {
      const user = this.user();
      if (user && !this.form.controls.mobile.dirty) this.form.controls.mobile.setValue(user.mobile);
    });

    effect(() => {
      const needsValue = this.needsValue();
      const ctrl = this.form.controls.estimatedValue;
      ctrl.setValidators(needsValue ? [Validators.required, Validators.min(1)] : []);
      ctrl.updateValueAndValidity({ emitEvent: false });
    });

    this.form.controls.branchId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => this.pickedBranch.set(id));

    effect(() => {
      const picks = this.pickPlace();
      for (const c of [this.form.controls.branchId, this.form.controls.departmentId]) {
        c.setValidators(picks ? [Validators.required] : []);
        c.updateValueAndValidity({ emitEvent: false });
      }
    });

    effect(() => {
      const tpl = REQUEST_TEMPLATES.find((t) => t.id === this.template() && t.service === this.service());
      if (!tpl) return;
      this.templateDetails = tpl.details ?? {};
      this.form.patchValue({ titleAr: tpl.titleAr, descriptionAr: tpl.descriptionAr, priority: tpl.priority });
    });
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.details.invalid || this.submitting() || !this.user()) {
      this.form.markAllAsTouched();
      this.details.markAllAsTouched();
      this.toasts.warning('أكمل الحقول المطلوبة', 'راجع الحقول المظللة بالأحمر ثم أعد المحاولة.');
      return;
    }
    if (this.service() === 'traffic-accident' && this.attachments().length === 0) {
      this.toasts.warning('تقرير نجم مطلوب', 'أرفق تقرير نجم في قسم «المرفقات» قبل تقديم بلاغ الحادث.');
      return;
    }
    const v = this.form.getRawValue();
    const user = this.user()!;
    const specific = this.details.getRawValue();
    const rows = Array.isArray(specific['items']) ? (specific['items'] as Array<{ qty?: number; price?: number }>) : [];
    const tableTotal = itemsTotal(rows);
    const value = this.service() === 'purchase-request' ? tableTotal : this.needsValue() ? Number(v.estimatedValue) || tableTotal : 0;
    const draft: RequestDraft = {
      service: this.service(),
      requesterMobile: v.mobile,
      titleAr: v.titleAr,
      descriptionAr: v.descriptionAr,
      priority: this.hasScheduling() ? v.priority : 'normal',
      neededBy: v.neededBy && this.hasScheduling() ? toIsoDate(v.neededBy) : undefined,
      details: { ...this.templateDetails, ...specific },
      estimatedValue: value,
      branchId: this.pickPlace() ? v.branchId : user.branchId,
      departmentId: this.pickPlace() ? v.departmentId : user.departmentId,
      attachments: this.attachments(),
    };

    this.submitting.set(true);
    // Bus bookings go through the booking rules (lead time, capacity by time window, blocked days, waitlist).
    const create = this.service() === 'bus-booking' ? this.bookings.submit(draft) : this.requests.create(draft);
    create.subscribe({
      next: (request) => {
        if (request.details['waitlisted'] === true) {
          this.toasts.warning('أُضيف حجزك إلى قائمة الانتظار', `الرقم المرجعي: ${request.refNo} — سيُعتمد حين يتوفر باص لهذه الفترة.`);
        } else {
          this.toasts.success('تم استلام طلبك', `رقمك المرجعي للمتابعة: ${request.refNo}`);
        }
        void this.router.navigate(['/requests', request.id]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.requests.reportError(err, 'تعذر تقديم الطلب');
      },
    });
  }
}
