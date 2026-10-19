import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DemoBarComponent } from './core/demo-mode/demo-bar.component';
import { ToastContainerComponent } from './core/notifications/toast-container.component';
import { SlaMonitor } from './core/requests/sla-monitor';
import { SettingsService } from './core/settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, DemoBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--mnh-demobar-offset]': 'demoBarHidden() ? "0px" : "var(--mnh-demobar-height)"' },
  template: `
    <app-demo-bar />
    <router-outlet />
    <app-toast-container />
  `,
})
export class App {
  protected readonly demoBarHidden = inject(SettingsService).demoBarHidden;
  /** Starts the background SLA sweep. */
  private readonly slaMonitor = inject(SlaMonitor);
}
