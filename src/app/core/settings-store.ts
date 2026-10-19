import { Injectable, inject, signal } from '@angular/core';
import { DEFAULT_SETTINGS, PlatformSettings } from '../domain/models/platform';
import { SettingsRepository } from '../domain/repositories';

/** Approval limits and SLA hours as a signal (defaults until the first load completes). */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly repo = inject(SettingsRepository);
  private readonly _settings = signal<PlatformSettings>(DEFAULT_SETTINGS);

  readonly settings = this._settings.asReadonly();

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.repo.get().subscribe((s) => this._settings.set(s));
  }
}
