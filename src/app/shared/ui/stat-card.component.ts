import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-block h-100' },
  template: `
    <div class="card h-100">
      <div class="card-body d-flex align-items-center gap-3">
        <span
          class="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
          [class]="'bg-' + tone() + '-subtle text-' + tone() + '-emphasis'"
          style="inline-size: 3rem; block-size: 3rem"
        >
          <i class="bi fs-4" [class]="icon()" aria-hidden="true"></i>
        </span>
        <div class="min-w-0">
          <div class="text-muted-ar small">{{ label() }}</div>
          <div class="fs-3 fw-bold font-display lh-sm">
            <span class="ltr-inline">{{ value() }}</span>
          </div>
          @if (hint()) {
            <div class="small text-muted-ar">{{ hint() }}</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('bi-graph-up');
  readonly tone = input<'primary' | 'info' | 'success' | 'warning' | 'danger' | 'secondary'>('primary');
  readonly hint = input<string>('');
}
