import { Injectable, effect, signal } from '@angular/core';

const KEY = 'manhal:settings';

interface StoredSettings {
  hijri: boolean;
  sidebarCollapsed: boolean;
  demoBarHidden: boolean;
}

const DEFAULTS: StoredSettings = { hijri: false, sidebarCollapsed: false, demoBarHidden: false };

function load(): StoredSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<StoredSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Per-browser UI preferences (not part of the mock database, so a data reset keeps them). */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly initial = load();

  readonly hijri = signal(this.initial.hijri);
  readonly sidebarCollapsed = signal(this.initial.sidebarCollapsed);
  readonly demoBarHidden = signal(this.initial.demoBarHidden);

  constructor() {
    effect(() => {
      const value: StoredSettings = {
        hijri: this.hijri(),
        sidebarCollapsed: this.sidebarCollapsed(),
        demoBarHidden: this.demoBarHidden(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(value));
      } catch {
        // Ignore storage failures; preferences simply won't persist.
      }
    });
  }
}
