import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { NgbDate, NgbDatepickerModule, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap/datepicker';

const pad = (n: number): string => String(n).padStart(2, '0');

function toIso(d: NgbDateStruct | null): string | null {
  return d && d.year && d.month && d.day ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : null;
}

function fromIso(value: string | null): NgbDateStruct | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
}

/** dd/MM/yyyy date input with a Sunday-first Arabic picker. The form value is an ISO day (`yyyy-MM-dd`) or `null`. */
@Component({
  selector: 'app-date-field',
  imports: [ReactiveFormsModule, NgbDatepickerModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="input-group">
      <input
        [id]="inputId()"
        class="form-control ltr text-start"
        [class.is-invalid]="invalid()"
        placeholder="dd/MM/yyyy"
        ngbDatepicker
        #picker="ngbDatepicker"
        [formControl]="inner"
        [firstDayOfWeek]="7"
        [minDate]="minStruct()"
        [markDisabled]="markDisabled()"
        (blur)="touched()"
      />
      <button class="btn btn-outline-secondary" type="button" (click)="picker.toggle()" aria-label="فتح التقويم">
        <i class="bi bi-calendar3" aria-hidden="true"></i>
      </button>
    </div>
  `,
})
export class DateFieldComponent implements ControlValueAccessor {
  readonly inputId = input('');
  readonly invalid = input(false);
  /** Earliest selectable day (`yyyy-MM-dd`). */
  readonly min = input<string | null>(null);
  /** Days the picker greys out (weekends, blocked days...). */
  readonly disabledDays = input<(date: NgbDate) => boolean>(() => false);

  protected readonly inner = new FormControl<NgbDateStruct | null>(null);
  protected readonly minStruct = computed(() => fromIso(this.min()) as NgbDateStruct);
  protected readonly markDisabled = computed(() => this.disabledDays());

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.inner.valueChanges.subscribe((value) => this.onChange(typeof value === 'object' ? toIso(value) : null));
  }

  writeValue(value: string | null): void {
    this.inner.setValue(fromIso(value), { emitEvent: false });
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.inner.disable({ emitEvent: false });
    else this.inner.enable({ emitEvent: false });
  }

  protected touched(): void {
    this.onTouched();
  }
}
