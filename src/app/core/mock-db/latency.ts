import { InjectionToken } from '@angular/core';
import { Observable, defer, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** `[min, max]` simulated latency in ms. Tests provide `[0, 0]`. */
export const MOCK_LATENCY = new InjectionToken<readonly [number, number]>('MOCK_LATENCY', {
  providedIn: 'root',
  factory: () => [200, 500] as const,
});

/**
 * Runs `work` after a random delay inside the latency window and emits its result,
 * so mock repositories behave like HTTP calls. `work` runs at subscription time.
 */
export function latencyFrom<T>(window: readonly [number, number], work: () => T): Observable<T> {
  const [min, max] = window;
  const ms = max <= 0 ? 0 : Math.round(min + Math.random() * (max - min));
  const wait$: Observable<number> = ms === 0 ? of(0) : timer(ms);
  return wait$.pipe(switchMap(() => defer(() => of(work()))));
}
