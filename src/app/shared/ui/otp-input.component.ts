import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  output,
  signal,
  viewChildren,
} from '@angular/core';

/**
 * Six-box OTP field: auto-advance, backspace-to-previous, paste support.
 * The boxes are laid out left-to-right (digits are LTR), the surrounding form stays RTL.
 */
@Component({
  selector: 'app-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex justify-content-center gap-2" dir="ltr" role="group" [attr.aria-label]="label()">
      @for (i of indexes; track i) {
        <input
          #box
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          class="form-control text-center fs-4 fw-bold p-0"
          style="inline-size: 3rem; block-size: 3.5rem"
          [class.is-invalid]="invalid()"
          [disabled]="disabled()"
          [value]="digits()[i]"
          [attr.aria-label]="'الرقم ' + (i + 1)"
          (input)="onInput(i, $event)"
          (keydown)="onKeydown(i, $event)"
          (paste)="onPaste($event)"
          (focus)="select(i)"
        />
      }
    </div>
  `,
})
export class OtpInputComponent {
  readonly length = 6;
  readonly label = input('رمز التحقق');
  readonly invalid = input(false);
  readonly disabled = input(false);
  readonly value = model('');
  readonly completed = output<string>();

  protected readonly indexes = Array.from({ length: this.length }, (_, i) => i);
  /** One cell per box, so clearing a middle box never shifts the other digits. */
  protected readonly digits = signal<string[]>(Array.from({ length: this.length }, () => ''));
  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  focusFirst(): void {
    this.boxes()[0]?.nativeElement.focus();
  }

  clear(): void {
    this.digits.set(Array.from({ length: this.length }, () => ''));
    this.value.set('');
    this.focusFirst();
  }

  protected select(i: number): void {
    this.boxes()[i]?.nativeElement.select();
  }

  protected onInput(i: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = input.value.replace(/\D/g, '').slice(-1);
    input.value = digit;
    this.write(i, digit);
    if (digit && i < this.length - 1) this.boxes()[i + 1].nativeElement.focus();
  }

  protected onKeydown(i: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[i] && i > 0) {
      this.write(i - 1, '');
      this.boxes()[i - 1].nativeElement.focus();
    } else if (event.key === 'ArrowLeft' && i > 0) {
      this.boxes()[i - 1].nativeElement.focus();
    } else if (event.key === 'ArrowRight' && i < this.length - 1) {
      this.boxes()[i + 1].nativeElement.focus();
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, this.length);
    if (!pasted) return;
    event.preventDefault();
    this.digits.set(Array.from({ length: this.length }, (_, i) => pasted[i] ?? ''));
    this.value.set(pasted);
    this.boxes()[Math.min(pasted.length, this.length - 1)].nativeElement.focus();
    if (pasted.length === this.length) this.completed.emit(pasted);
  }

  private write(i: number, digit: string): void {
    const cells = this.digits().slice();
    cells[i] = digit;
    this.digits.set(cells);
    const next = cells.join('');
    this.value.set(next);
    if (cells.every((c) => c !== '')) this.completed.emit(next);
  }
}
