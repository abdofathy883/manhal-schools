import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SCHOOL_TAGLINE } from '../../domain/reference-data';
import { SettingsService } from '../settings.service';
import { BreadcrumbsComponent } from './breadcrumbs.component';
import { PermissionService } from '../rbac/permission.service';
import { SidebarComponent } from './sidebar.component';
import { TopbarComponent } from './topbar.component';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { UserMenuComponent } from './user-menu.component';

/** Authenticated app frame: sidebar at the start side (right in RTL), top bar, routed content. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, BreadcrumbsComponent, UserMenuComponent, NotificationBellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="visually-hidden-focusable position-absolute p-2 bg-white" href="#main-content">تخطَّ إلى المحتوى</a>
    <div class="d-flex" style="min-block-size: calc(100dvh - var(--mnh-demobar-offset, 0px))">
      <app-sidebar
        [items]="permissions.visibleMenu()"
        [collapsed]="settings.sidebarCollapsed()"
        [mobileOpen]="mobileOpen()"
        (closeMobile)="mobileOpen.set(false)"
      />
      @if (mobileOpen()) {
        <div class="mnh-backdrop d-lg-none" (click)="mobileOpen.set(false)" aria-hidden="true"></div>
      }
      <div class="flex-grow-1 d-flex flex-column min-w-0">
        <app-topbar (toggleSidebar)="toggleSidebar()">
          <app-notification-bell />
          <app-user-menu />
        </app-topbar>
        <main id="main-content" class="flex-grow-1 p-3 p-lg-4" tabindex="-1">
          <app-breadcrumbs />
          <router-outlet />
        </main>
        <footer class="text-center small text-muted-ar py-3 no-print">
          {{ tagline }} · مدارس المنهل
        </footer>
      </div>
    </div>
  `,
  styles: `
    .mnh-backdrop {
      position: fixed;
      inset: 0;
      background: rgb(10 30 50 / 45%);
      z-index: 1025;
    }
  `,
})
export class ShellComponent {
  protected readonly settings = inject(SettingsService);
  protected readonly permissions = inject(PermissionService);
  protected readonly tagline = SCHOOL_TAGLINE;
  protected readonly mobileOpen = signal(false);

  protected toggleSidebar(): void {
    if (window.matchMedia('(min-width: 992px)').matches) {
      this.settings.sidebarCollapsed.update((v) => !v);
    } else {
      this.mobileOpen.update((v) => !v);
    }
  }
}
