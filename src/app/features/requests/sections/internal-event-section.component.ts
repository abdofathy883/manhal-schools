import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Clock } from '../../../core/clock.service';
import { dayKey } from '../../../domain/bookings/booking-rules';
import { LARGE_EVENT_ATTENDEES } from '../../../domain/workflows/workflow-defs';
import { DateFieldComponent } from '../../../shared/ui/date-field.component';
import { ServiceSectionBase } from './section-base';

interface NeedOption {
  key: string;
  label: string;
  hint: string;
}

const NEEDS: readonly NeedOption[] = [
  { key: 'bus', label: 'باص', hint: 'طلب حجز باص يؤكده مسؤول النقل' },
  { key: 'venue', label: 'تجهيز المكان / صيانة', hint: 'طلب صيانة مبانٍ لتجهيز المكان' },
  { key: 'materials', label: 'مواد من المستودع', hint: 'طلب احتياج من المستودع' },
];

/** Internal event: date, place, attendees and the equipment checklist that becomes child requests once the event is approved. */
@Component({
  selector: 'app-internal-event-section',
  imports: [ReactiveFormsModule, DateFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات الفعالية</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="ev-date">تاريخ الفعالية <span class="text-danger" aria-hidden="true">*</span></label>
            <app-date-field inputId="ev-date" formControlName="eventDate" [min]="tomorrow" [invalid]="bad('eventDate')" />
            @if (bad('eventDate')) {
              <div class="text-danger small mt-1" role="alert">حدد تاريخ الفعالية (من الغد فصاعدًا).</div>
            }
          </div>
          <div class="col-md-6">
            <label class="form-label" for="ev-place">المكان <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="ev-place" class="form-control" formControlName="place" [class.is-invalid]="bad('place')" />
            <div class="invalid-feedback">حدد مكان الفعالية.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="ev-att">عدد الحضور <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="ev-att" type="number" min="1" max="5000" class="form-control ltr text-start" formControlName="attendees" [class.is-invalid]="bad('attendees')" />
            <div class="invalid-feedback">أدخل عدد الحضور (من 1 إلى 5000).</div>
            @if (large()) {
              <div class="form-text text-warning-emphasis"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>الفعاليات التي يتجاوز حضورها {{ largeLimit }} شخص تحتاج اعتماد الإدارة العليا بعد مشرف الفرع.</div>
            }
          </div>
          <div class="col-12">
            <fieldset>
              <legend class="form-label">التجهيزات المطلوبة</legend>
              @for (n of needs; track n.key) {
                <div class="form-check mb-1">
                  <input class="form-check-input" type="checkbox" [id]="'ev-need-' + n.key" [checked]="has(n.key)" (change)="toggle(n.key)" />
                  <label class="form-check-label" [for]="'ev-need-' + n.key">{{ n.label }}</label>
                  <span class="text-muted-ar small ms-1">— {{ n.hint }}</span>
                </div>
              }
              <div class="form-text mt-2"><i class="bi bi-diagram-3 me-1" aria-hidden="true"></i>بعد اعتماد الفعالية تُنشأ الطلبات المرتبطة تلقائيًا، وتُغلق الفعالية حين تكتمل جميعها.</div>
            </fieldset>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class InternalEventSectionComponent extends ServiceSectionBase {
  private readonly clock = inject(Clock);

  protected readonly needs = NEEDS;
  protected readonly largeLimit = LARGE_EVENT_ATTENDEES;
  protected readonly tomorrow = dayKey(new Date(this.clock.now().getFullYear(), this.clock.now().getMonth(), this.clock.now().getDate() + 1));

  private readonly needsControl = new FormControl<string[]>([], { nonNullable: true });

  protected build(): Record<string, AbstractControl> {
    return {
      eventDate: new FormControl<string | null>(null, { validators: [Validators.required] }),
      place: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      attendees: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1), Validators.max(5000)] }),
      needs: this.needsControl,
    };
  }

  protected large(): boolean {
    return Number(this.group().get('attendees')?.value) > LARGE_EVENT_ATTENDEES;
  }

  protected has(key: string): boolean {
    return this.needsControl.value.includes(key);
  }

  protected toggle(key: string): void {
    const current = this.needsControl.value;
    this.needsControl.setValue(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
  }
}
