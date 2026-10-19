import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, map } from 'rxjs';
import { RequestService } from '../../../core/requests/request.service';
import { ReferenceRepository } from '../../../domain/repositories';
import { ServiceSectionBase } from './section-base';

/** Complaint: category, confidentiality, and an optional link to the request being complained about. */
@Component({
  selector: 'app-complaint-section',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">بيانات الشكوى</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label" for="cp-cat">التصنيف <span class="text-danger" aria-hidden="true">*</span></label>
            <select id="cp-cat" class="form-select" formControlName="categoryId" [class.is-invalid]="bad('categoryId')">
              <option value="">اختر التصنيف</option>
              @for (c of data.value()?.lists?.complaintCategories ?? []; track c.id) {
                <option [value]="c.id">{{ c.nameAr }}</option>
              }
            </select>
            <div class="invalid-feedback">اختر تصنيف الشكوى.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="cp-link">الطلب المشتكى منه (اختياري)</label>
            <select id="cp-link" class="form-select" [value]="group().get('linkedRequestId')?.value" (change)="link($any($event.target).value)">
              <option value="">بدون ربط بطلب</option>
              @for (r of data.value()?.requests ?? []; track r.id) {
                <option [value]="r.id">{{ r.refNo }} — {{ r.titleAr }}</option>
              }
            </select>
            <div class="form-text">تظهر الشكوى في الخط الزمني للطلب وفي مؤشرات جودة الجهة المنفذة.</div>
          </div>
          <div class="col-12">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" role="switch" id="cp-conf" formControlName="confidential" />
              <label class="form-check-label" for="cp-conf">شكوى سرية</label>
            </div>
            <div class="form-text">لا يطّلع عليها إلا من يملك صلاحية الشكاوى السرية، ولا تظهر لغيرهم حتى لو عرفوا رقمها.</div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class ComplaintSectionComponent extends ServiceSectionBase {
  private readonly reference = inject(ReferenceRepository);
  private readonly requests = inject(RequestService);

  protected readonly data = rxResource({
    stream: () =>
      forkJoin({
        lists: this.reference.lists(),
        requests: this.requests.list().pipe(map((list) => list.filter((r) => r.service !== 'complaint'))),
      }),
  });

  protected build(): Record<string, AbstractControl> {
    return {
      categoryId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      confidential: new FormControl(false, { nonNullable: true }),
      linkedRequestId: new FormControl('', { nonNullable: true }),
      linkedRequestRef: new FormControl('', { nonNullable: true }),
    };
  }

  protected link(id: string): void {
    const request = (this.data.value()?.requests ?? []).find((r) => r.id === id);
    this.group().get('linkedRequestId')?.setValue(id);
    this.group().get('linkedRequestRef')?.setValue(request?.refNo ?? '');
  }
}
