import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, startWith } from 'rxjs';

interface Crumb {
  label: string;
  url: string;
}

/** Builds crumbs from `data.breadcrumb` on the active route chain. */
@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (crumbs().length > 1) {
      <nav aria-label="مسار التنقل" class="mb-3 no-print">
        <ol class="breadcrumb mb-0 small">
          @for (c of crumbs(); track c.url; let last = $last) {
            <li class="breadcrumb-item" [class.active]="last" [attr.aria-current]="last ? 'page' : null">
              @if (last) {
                {{ c.label }}
              } @else {
                <a [routerLink]="c.url">{{ c.label }}</a>
              }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: `
    .breadcrumb {
      --bs-breadcrumb-divider: '‹';
    }
  `,
})
export class BreadcrumbsComponent {
  private readonly router = inject(Router);

  protected readonly crumbs = signal<Crumb[]>([]);

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.crumbs.set(this.build()));
  }

  private build(): Crumb[] {
    const crumbs: Crumb[] = [{ label: 'الرئيسية', url: '/home' }];
    let url = '';
    let node: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root.firstChild;
    while (node) {
      const segment = node.url.map((s) => s.path).join('/');
      if (segment) url += `/${segment}`;
      const label = node.data['breadcrumb'] as string | undefined;
      if (label && url !== '/home') crumbs.push({ label, url });
      node = node.firstChild;
    }
    return crumbs;
  }
}
