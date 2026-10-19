import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SCHOOL_TAGLINE } from '../../domain/reference-data';
import { BrandLogoComponent } from '../../shared/ui/brand-logo.component';
import { MenuItem } from './menu.config';

interface MenuRow {
  item: MenuItem;
  section: string | null;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, BrandLogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mnh-sidebar d-flex flex-column',
    '[class.collapsed]': 'collapsed()',
    '[class.mobile-open]': 'mobileOpen()',
  },
  template: `
    <div class="mnh-sidebar-head d-flex align-items-center justify-content-between px-3">
      <app-brand-logo [light]="true" [compact]="collapsed()" />
      <button
        type="button"
        class="btn btn-sm btn-link text-white d-lg-none"
        aria-label="إغلاق القائمة"
        (click)="closeMobile.emit()"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </div>

    <nav class="flex-grow-1 overflow-auto px-2 py-3" aria-label="القائمة الرئيسية">
      <ul class="list-unstyled m-0">
        @for (row of rows(); track row.item.route) {
          @if (row.section && !collapsed()) {
            <li class="mnh-section px-3 pt-3 pb-1" aria-hidden="true">{{ row.section }}</li>
          }
          <li>
            <a
              class="mnh-link d-flex align-items-center gap-3"
              [routerLink]="row.item.route"
              routerLinkActive="active"
              [attr.title]="collapsed() ? row.item.label : null"
              [attr.aria-label]="row.item.label"
              (click)="closeMobile.emit()"
            >
              <i class="bi fs-5" [class]="row.item.icon" aria-hidden="true"></i>
              @if (!collapsed()) {
                <span class="text-truncate">{{ row.item.label }}</span>
              }
            </a>
          </li>
        }
      </ul>
    </nav>

    @if (!collapsed()) {
      <div class="mnh-sidebar-foot small px-3 py-3">{{ tagline }}</div>
    }
  `,
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly items = input.required<readonly MenuItem[]>();
  readonly collapsed = input(false);
  readonly mobileOpen = input(false);
  readonly closeMobile = output();

  protected readonly tagline = SCHOOL_TAGLINE;

  /** The section heading is shown above the first visible item of each section. */
  protected readonly rows = computed<MenuRow[]>(() => {
    let previous: string | null = null;
    return this.items().map((item) => {
      const section = item.section && item.section !== previous ? item.section : null;
      previous = item.section ?? null;
      return { item, section };
    });
  });
}
