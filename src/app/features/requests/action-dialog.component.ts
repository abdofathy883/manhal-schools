import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal';
import { User } from '../../domain/models/rbac';
import { ConfirmationOutcome, CostLine, HoldReason } from '../../domain/models/request';
import { HOLD_REASON_LABELS } from '../../domain/reference-data';
import { ActionDescriptor, ActionPayload } from '../../domain/workflows/engine';
import { StarRatingComponent } from '../../shared/ui/star-rating.component';

type Stars = 1 | 2 | 3 | 4 | 5;

/** One dialog for every engine action that needs input (reason, assignee, hold reason, confirmation, rating, cost). */
@Component({
  selector: 'app-action-dialog',
  imports: [ReactiveFormsModule, StarRatingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (descriptor(); as d) {
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="modal-header">
          <h2 class="modal-title h5"><i class="bi me-2" [class]="d.icon" aria-hidden="true"></i>{{ d.labelAr }}</h2>
          <button type="button" class="btn-close" aria-label="إغلاق" (click)="modal.dismiss()"></button>
        </div>

        <div class="modal-body">
          @switch (d.dialog) {
            @case ('assign') {
              <label class="form-label" for="ad-assignee">المنفّذ المسؤول <span class="text-danger" aria-hidden="true">*</span></label>
              <select id="ad-assignee" class="form-select" formControlName="assigneeId" [class.is-invalid]="showError() && !form.value.assigneeId">
                <option value="">اختر المنفّذ</option>
                @for (u of assignees(); track u.id) {
                  <option [value]="u.id">{{ u.nameAr }} — {{ u.jobTitleAr }}</option>
                }
              </select>
              <div class="invalid-feedback">اختر المنفّذ المسؤول.</div>
            }
            @case ('hold') {
              <label class="form-label" for="ad-hold">سبب التعليق <span class="text-danger" aria-hidden="true">*</span></label>
              <select id="ad-hold" class="form-select mb-3" formControlName="holdReason" [class.is-invalid]="showError() && !form.value.holdReason">
                <option value="">اختر السبب</option>
                @for (r of holdReasons; track r.key) {
                  <option [value]="r.key">{{ r.label }}</option>
                }
              </select>
              <div class="invalid-feedback">اختر سبب التعليق.</div>
            }
            @case ('confirm') {
              <fieldset class="mb-3">
                <legend class="form-label">نتيجة الخدمة</legend>
                <div class="form-check">
                  <input class="form-check-input" type="radio" id="oc-ok" value="accepted" formControlName="outcome" />
                  <label class="form-check-label" for="oc-ok">مقبول ويعمل بصورة سليمة</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" id="oc-note" value="accepted_with_note" formControlName="outcome" />
                  <label class="form-check-label" for="oc-note">مقبول مع ملاحظة</label>
                </div>
              </fieldset>
              @if (canRate()) {
                <div class="mb-3">
                  <span class="form-label d-block">قيّم الخدمة (اختياري)</span>
                  <app-star-rating [(value)]="stars" />
                </div>
              }
            }
            @case ('rate') {
              <span class="form-label d-block">كم تقيّم الخدمة؟</span>
              <app-star-rating [(value)]="stars" />
              @if (showError() && !stars()) {
                <div class="text-danger small mt-1" role="alert">اختر عدد النجوم.</div>
              }
            }
            @case ('cost') {
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label" for="ad-kind">النوع</label>
                  <select id="ad-kind" class="form-select" formControlName="kind">
                    <option value="part">قطعة غيار</option>
                    <option value="labour">أعمال / ساعات عمل</option>
                    <option value="purchase">مشتريات</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div class="col-md-8">
                  <label class="form-label" for="ad-cdesc">الوصف <span class="text-danger" aria-hidden="true">*</span></label>
                  <input id="ad-cdesc" class="form-control" formControlName="descriptionAr" [class.is-invalid]="showError() && !form.value.descriptionAr?.trim()" />
                </div>
                <div class="col-6">
                  <label class="form-label" for="ad-qty">الكمية</label>
                  <input id="ad-qty" type="number" min="1" class="form-control ltr text-start" formControlName="quantity" />
                </div>
                <div class="col-6">
                  <label class="form-label" for="ad-unit">سعر الوحدة (ر.س)</label>
                  <input id="ad-unit" type="number" min="0" class="form-control ltr text-start" formControlName="unitCost" />
                </div>
              </div>
            }
          }

          @if (hasNote(d)) {
            <div [class.mt-3]="d.dialog !== 'note'">
              <label class="form-label" for="ad-note">
                {{ noteLabel(d) }}
                @if (noteIsRequired(d)) {
                  <span class="text-danger" aria-hidden="true">*</span>
                }
              </label>
              <textarea id="ad-note" class="form-control" rows="3" formControlName="noteAr" [class.is-invalid]="showError() && noteIsRequired(d) && !form.value.noteAr?.trim()"></textarea>
              <div class="invalid-feedback">هذا الحقل مطلوب.</div>
            </div>
          }
        </div>

        <div class="modal-footer">
          <button type="submit" class="btn" [class]="'btn-' + d.tone">{{ d.labelAr }}</button>
          <button type="button" class="btn btn-outline-secondary" (click)="modal.dismiss()">إلغاء</button>
        </div>
      </form>
    }
  `,
})
export class ActionDialogComponent {
  protected readonly modal = inject(NgbActiveModal);

  protected readonly descriptor = signal<ActionDescriptor | null>(null);
  protected readonly assignees = signal<User[]>([]);
  protected readonly canRate = signal(false);
  protected readonly showError = signal(false);
  protected readonly stars = signal<Stars | null>(null);
  protected readonly holdReasons = (Object.keys(HOLD_REASON_LABELS) as HoldReason[]).map((key) => ({ key, label: HOLD_REASON_LABELS[key] }));

  protected readonly form = new FormGroup({
    noteAr: new FormControl('', { nonNullable: true }),
    assigneeId: new FormControl('', { nonNullable: true }),
    holdReason: new FormControl<HoldReason | ''>('', { nonNullable: true }),
    outcome: new FormControl<ConfirmationOutcome>('accepted', { nonNullable: true }),
    kind: new FormControl<CostLine['kind']>('part', { nonNullable: true }),
    descriptionAr: new FormControl('', { nonNullable: true }),
    quantity: new FormControl(1, { nonNullable: true }),
    unitCost: new FormControl(0, { nonNullable: true }),
  });

  /** Called by the opener right after `NgbModal.open`. */
  init(descriptor: ActionDescriptor, assignees: User[], canRate: boolean): void {
    this.descriptor.set(descriptor);
    this.assignees.set(assignees);
    this.canRate.set(canRate);
  }

  protected hasNote(d: ActionDescriptor): boolean {
    return d.dialog !== 'assign' && d.dialog !== 'rate' && d.dialog !== 'cost';
  }

  protected noteLabel(d: ActionDescriptor): string {
    switch (d.key) {
      case 'reject':
        return 'سبب الرفض';
      case 'return':
        return 'المطلوب استكماله';
      case 'reject_result':
        return 'سبب رفض النتيجة';
      case 'hold':
        return 'ملاحظة';
      default:
        return d.noteRequired ? 'الملاحظة' : 'ملاحظة (اختيارية)';
    }
  }

  protected noteIsRequired(d: ActionDescriptor): boolean {
    if (d.noteRequired) return true;
    if (d.dialog === 'hold') return this.form.value.holdReason === 'requester_info';
    if (d.dialog === 'confirm') return this.form.value.outcome === 'accepted_with_note';
    return false;
  }

  protected submit(): void {
    const d = this.descriptor();
    if (!d) return;
    const v = this.form.getRawValue();
    this.showError.set(true);

    if (this.noteIsRequired(d) && !v.noteAr.trim()) return;
    const payload: ActionPayload = { noteAr: v.noteAr.trim() || undefined };

    switch (d.dialog) {
      case 'assign': {
        const user = this.assignees().find((u) => u.id === v.assigneeId);
        if (!user) return;
        payload.assigneeId = user.id;
        payload.assigneeName = user.nameAr;
        break;
      }
      case 'hold':
        if (!v.holdReason) return;
        payload.holdReason = v.holdReason;
        break;
      case 'confirm':
        payload.outcome = v.outcome;
        if (this.stars()) payload.rating = { stars: this.stars()! };
        break;
      case 'rate':
        if (!this.stars()) return;
        payload.rating = { stars: this.stars()!, noteAr: v.noteAr.trim() || undefined };
        break;
      case 'cost':
        if (!v.descriptionAr.trim()) return;
        payload.cost = { kind: v.kind, descriptionAr: v.descriptionAr.trim(), quantity: Number(v.quantity), unitCost: Number(v.unitCost) };
        break;
    }
    this.modal.close(payload);
  }
}
