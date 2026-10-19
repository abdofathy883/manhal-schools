import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/** Top bar: sidebar toggle + global search. The bell and user chip are projected by the shell. */
@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mnh-topbar d-flex align-items-center gap-3 px-3 px-lg-4 bg-white' },
  template: `
    <button type="button" class="btn btn-light border-0" aria-label="تبديل القائمة الجانبية" (click)="toggleSidebar.emit()">
      <i class="bi bi-list fs-4" aria-hidden="true"></i>
    </button>

    <form class="flex-grow-1 d-none d-md-block" role="search" (submit)="$event.preventDefault()">
      <label class="visually-hidden" for="global-search">بحث في الطلبات</label>
      <div class="input-group" style="max-inline-size: 30rem">
        <span class="input-group-text bg-body-tertiary border-0"><i class="bi bi-search" aria-hidden="true"></i></span>
        <input
          id="global-search"
          type="search"
          class="form-control bg-body-tertiary border-0"
          placeholder="ابحث برقم الطلب أو العنوان…"
          autocomplete="off"
        />
      </div>
    </form>

    <div class="ms-auto d-flex align-items-center gap-2">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      block-size: var(--mnh-topbar-height);
      border-block-end: 1px solid var(--mnh-border);
      position: sticky;
      inset-block-start: var(--mnh-demobar-offset, 0px);
      z-index: 1020;
    }
  `,
})
export class TopbarComponent {
  readonly toggleSidebar = output();
}
