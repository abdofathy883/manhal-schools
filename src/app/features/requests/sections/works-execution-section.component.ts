import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AbstractControl, FormArray, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ItemRowGroup, ItemsTableComponent } from './items-table.component';
import { ServiceSectionBase } from './section-base';

/** Works execution: scope, location, justification, optional bill of quantities. */
@Component({
  selector: 'app-works-execution-section',
  imports: [ReactiveFormsModule, ItemsTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card mb-4" [formGroup]="group()">
      <div class="card-header">نطاق الأعمال</div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label" for="we-scope">نطاق العمل <span class="text-danger" aria-hidden="true">*</span></label>
            <textarea id="we-scope" class="form-control" rows="3" formControlName="scope" placeholder="صف الأعمال المطلوب تنفيذها بدقة" [class.is-invalid]="bad('scope')"></textarea>
            <div class="invalid-feedback">اكتب نطاق العمل.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="we-location">الموقع <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="we-location" class="form-control" formControlName="location" [class.is-invalid]="bad('location')" />
            <div class="invalid-feedback">حدد موقع التنفيذ.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label" for="we-just">المبرر <span class="text-danger" aria-hidden="true">*</span></label>
            <input id="we-just" class="form-control" formControlName="justification" [class.is-invalid]="bad('justification')" />
            <div class="invalid-feedback">اذكر مبرر الطلب.</div>
          </div>
          <div class="col-12">
            <h3 class="h6">جدول البنود (اختياري)</h3>
            <app-items-table [rows]="items" [optional]="true" [submitted]="submitted()" />
          </div>
        </div>
      </div>
    </section>
  `,
})
export class WorksExecutionSectionComponent extends ServiceSectionBase {
  protected readonly items = new FormArray<ItemRowGroup>([]);

  protected build(): Record<string, AbstractControl> {
    return {
      scope: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      location: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      justification: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      items: this.items,
    };
  }
}
