import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-skeleton-rows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="status" aria-live="polite" aria-label="جارٍ التحميل">
      @for (row of rows(); track row) {
        <span class="skeleton mb-3" [style.block-size]="height()" [style.inline-size]="row % 3 === 0 ? '70%' : '100%'"></span>
      }
    </div>
  `,
})
export class SkeletonRowsComponent {
  readonly count = input(5);
  readonly height = input('2.75rem');

  protected readonly rows = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}
