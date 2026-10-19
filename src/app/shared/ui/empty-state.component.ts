import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text-center py-5 px-3" role="status">
      <svg width="120" height="96" viewBox="0 0 120 96" aria-hidden="true" class="mb-3">
        <circle cx="60" cy="48" r="44" fill="#e3edf5" />
        <rect x="34" y="28" width="52" height="40" rx="8" fill="#fff" stroke="#b5cde0" stroke-width="2" />
        <rect x="42" y="38" width="36" height="5" rx="2.5" fill="#b5cde0" />
        <rect x="42" y="48" width="24" height="5" rx="2.5" fill="#dbe5ec" />
        <circle cx="86" cy="66" r="12" fill="#2B93B0" />
        <path d="M81 66h10M86 61v10" stroke="#fff" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      <h2 class="h5 mb-1">{{ title() }}</h2>
      @if (message()) {
        <p class="text-muted-ar mb-3">{{ message() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input('لا توجد بيانات');
  readonly message = input('');
}
