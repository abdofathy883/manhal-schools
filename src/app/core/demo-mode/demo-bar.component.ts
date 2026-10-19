import { ChangeDetectionStrategy, Component, TemplateRef, inject } from '@angular/core';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap/dropdown';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap/modal';
import { NgbOffcanvas, NgbOffcanvasModule } from '@ng-bootstrap/ng-bootstrap/offcanvas';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap/tooltip';
import { AuthService } from '../auth/auth.service';
import { EffectivePermissionsPanelComponent } from '../rbac/effective-permissions-panel.component';
import { DemoModeService, placeOf } from './demo-mode.service';

/** Slim bar above the app: identity switcher, abilities panel, data reset. Hideable for clean screen-shares. */
@Component({
  selector: 'app-demo-bar',
  imports: [NgbDropdownModule, NgbModalModule, NgbOffcanvasModule, NgbTooltipModule, EffectivePermissionsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './demo-bar.component.html',
  styleUrl: './demo-bar.component.scss',
})
export class DemoBarComponent {
  protected readonly demo = inject(DemoModeService);
  protected readonly auth = inject(AuthService);
  private readonly modals = inject(NgbModal);
  private readonly offcanvas = inject(NgbOffcanvas);

  protected readonly placeOf = placeOf;

  protected openAbilities(content: TemplateRef<unknown>): void {
    this.offcanvas.open(content, { position: 'start', ariaLabelledBy: 'abilities-title' });
  }

  protected confirmReset(content: TemplateRef<unknown>): void {
    this.modals.open(content, { centered: true, size: 'sm' }).result.then(
      () => this.demo.resetData(),
      () => undefined,
    );
  }
}
