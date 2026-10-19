import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

type Stars = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-star-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="d-inline-flex gap-1" role="radiogroup" [attr.aria-label]="label()">
      @for (n of stars; track n) {
        <button
          type="button"
          class="btn btn-link p-0 text-warning fs-4 lh-1"
          role="radio"
          [disabled]="readonly()"
          [attr.aria-checked]="value() === n"
          [attr.aria-label]="n + ' من 5'"
          (click)="value.set(n)"
        >
          <i class="bi" [class]="(value() ?? 0) >= n ? 'bi-star-fill' : 'bi-star'" aria-hidden="true"></i>
        </button>
      }
    </span>
  `,
})
export class StarRatingComponent {
  protected readonly stars: readonly Stars[] = [1, 2, 3, 4, 5];
  readonly value = model<Stars | null>(null);
  readonly readonly = input(false);
  readonly label = input('التقييم');
}
