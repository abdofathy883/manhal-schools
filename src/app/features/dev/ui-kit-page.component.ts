import { ChangeDetectionStrategy, Component, TemplateRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap/accordion';
import { NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap/datepicker';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap/dropdown';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap/modal';
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap/nav';
import { NgbOffcanvas, NgbOffcanvasModule } from '@ng-bootstrap/ng-bootstrap/offcanvas';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap/pagination';
import { NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap/popover';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap/tooltip';
import { NgbTypeaheadModule } from '@ng-bootstrap/ng-bootstrap/typeahead';
import { Observable, OperatorFunction, debounceTime, map } from 'rxjs';
import { ToastService } from '../../core/notifications/toast.service';
import { BRANCHES, STATUS_FLOW } from '../../domain/reference-data';
import { AttachmentMeta, RequestStatus, TimelineEvent } from '../../domain/models/request';
import { ArDatePipe, MoneyPipe } from '../../shared/pipes/format';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FileChipComponent } from '../../shared/ui/file-chip.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SkeletonRowsComponent } from '../../shared/ui/skeleton-rows.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { PriorityBadgeComponent, StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { StatusStepperComponent } from '../../shared/ui/status-stepper.component';
import { TimelineComponent } from '../../shared/ui/timeline.component';

/** Phase 1 smoke page: every UI-kit piece and every ng-bootstrap widget, rendered RTL. */
@Component({
  selector: 'app-ui-kit-page',
  imports: [
    ReactiveFormsModule,
    NgbAccordionModule,
    NgbDatepickerModule,
    NgbDropdownModule,
    NgbModalModule,
    NgbNavModule,
    NgbOffcanvasModule,
    NgbPaginationModule,
    NgbPopoverModule,
    NgbTooltipModule,
    NgbTypeaheadModule,
    ArDatePipe,
    MoneyPipe,
    EmptyStateComponent,
    FileChipComponent,
    PageHeaderComponent,
    SkeletonRowsComponent,
    StatCardComponent,
    StatusBadgeComponent,
    PriorityBadgeComponent,
    StatusStepperComponent,
    TimelineComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-kit-page.component.html',
})
export class UiKitPageComponent {
  private readonly modals = inject(NgbModal);
  private readonly offcanvas = inject(NgbOffcanvas);
  private readonly toasts = inject(ToastService);

  protected readonly statuses: readonly RequestStatus[] = [...STATUS_FLOW, 'rejected', 'cancelled', 'returned'];
  protected readonly dateControl = new FormControl<{ year: number; month: number; day: number } | null>(null);
  protected readonly branchControl = new FormControl('');
  protected readonly page = signal(3);
  protected readonly activeTab = signal(1);
  protected readonly today = new Date();

  protected readonly files: AttachmentMeta[] = [
    { id: 'f1', name: 'ac-unit-photo.jpg', sizeBytes: 842_000, mime: 'image/jpeg', uploadedBy: 'u-e1001', at: new Date().toISOString() },
    { id: 'f2', name: 'najm-report-2026.pdf', sizeBytes: 2_400_000, mime: 'application/pdf', uploadedBy: 'u-e1010', at: new Date().toISOString() },
    { id: 'f3', name: 'inspection.mp4', sizeBytes: 18_500_000, mime: 'video/mp4', uploadedBy: 'u-e1005', at: new Date().toISOString() },
  ];

  protected readonly events: TimelineEvent[] = [
    { id: 'e1', type: 'created', at: new Date().toISOString(), actorId: 'u-e1001', actorRoleAr: 'مقدم الطلب', textAr: 'قدّمت نورة العتيبي طلب صيانة (تكييف)' },
    { id: 'e2', type: 'routed', at: new Date().toISOString(), actorId: null, actorRoleAr: 'النظام', textAr: 'تم توجيه الطلب تلقائيًا إلى فريق الصيانة — فرع التعاون' },
    { id: 'e3', type: 'part_requested', at: new Date().toISOString(), actorId: 'u-e1005', actorRoleAr: 'فني الصيانة', textAr: 'يحتاج الطلب إلى قطعة غيار: مكثف مروحة تكييف', noteAr: 'القطعة غير متوفرة في المستودع — تم إنشاء طلب شراء مرتبط.' },
    { id: 'e4', type: 'sla_breach', at: new Date().toISOString(), actorId: null, actorRoleAr: 'النظام', textAr: 'تم التصعيد إلى مسؤول الصيانة بسبب تجاوز مدة الاستجابة' },
  ];

  protected readonly searchBranches: OperatorFunction<string, readonly string[]> = (text$: Observable<string>) =>
    text$.pipe(
      debounceTime(150),
      map((term) =>
        term.length < 1 ? [] : BRANCHES.map((b) => b.nameAr).filter((n) => n.includes(term)).slice(0, 5),
      ),
    );

  protected openModal(content: TemplateRef<unknown>): void {
    this.modals.open(content, { centered: true });
  }

  protected openOffcanvas(content: TemplateRef<unknown>): void {
    this.offcanvas.open(content, { position: 'start', ariaLabelledBy: 'kit-offcanvas-title' });
  }

  protected toast(): void {
    this.toasts.success('تم الحفظ', 'تم حفظ التغييرات بنجاح.');
  }
}
