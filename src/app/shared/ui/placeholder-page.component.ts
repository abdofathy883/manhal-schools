import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { EmptyStateComponent } from './empty-state.component';
import { PageHeaderComponent } from './page-header.component';

/** Stand-in for screens that arrive in a later build phase; reads its title from route data. */
@Component({
  selector: 'app-placeholder-page',
  imports: [PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="title()" />
    <div class="card">
      <app-empty-state title="هذه الشاشة قيد البناء" message="ستتوفر في مرحلة قادمة من العرض التجريبي." />
    </div>
  `,
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data.pipe(map((d) => d['title'] as string | undefined)));

  protected readonly title = computed(() => this.data() ?? 'شاشة');
}
