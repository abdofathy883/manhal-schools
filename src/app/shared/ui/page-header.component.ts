import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
      <div>
        <h1 class="h3 mb-1">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="text-muted-ar mb-0">{{ subtitle() }}</p>
        }
      </div>
      <div class="d-flex flex-wrap gap-2 no-print">
        <ng-content />
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
