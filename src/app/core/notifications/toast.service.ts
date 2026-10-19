import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'danger' | 'warning' | 'info' | 'primary';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  icon: string;
  /** Milliseconds before auto-dismiss. */
  delay: number;
}

const ICONS: Record<ToastTone, string> = {
  success: 'bi-check-circle-fill',
  danger: 'bi-x-octagon-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
  primary: 'bi-bell-fill',
};

/** App-wide toasts (Arabic copy supplied by callers). Rendered by `ToastContainerComponent`. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _toasts = signal<Toast[]>([]);

  readonly toasts = this._toasts.asReadonly();

  show(tone: ToastTone, title: string, message?: string, delay = 5000): void {
    const toast: Toast = { id: this.nextId++, tone, title, message, icon: ICONS[tone], delay };
    this._toasts.update((list) => [...list.slice(-3), toast]);
  }

  success(title: string, message?: string): void {
    this.show('success', title, message);
  }

  error(title: string, message?: string): void {
    this.show('danger', title, message, 7000);
  }

  info(title: string, message?: string): void {
    this.show('info', title, message);
  }

  warning(title: string, message?: string): void {
    this.show('warning', title, message, 6000);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
