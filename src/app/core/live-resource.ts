import { ResourceRef, effect, inject, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { DataVersion } from './data-version';

/**
 * `rxResource` that refetches whenever the mock backend reports a write (`DataVersion`),
 * keeping the previous value on screen while it reloads (no skeleton flash after an action).
 */
export function liveResource<T, P>(params: () => P, stream: (params: NonNullable<P>) => Observable<T>): ResourceRef<T | undefined>;
export function liveResource<T, P>(params: () => P, stream: (params: NonNullable<P>) => Observable<T>, defaultValue: T): ResourceRef<T>;
export function liveResource<T, P>(params: () => P, stream: (params: NonNullable<P>) => Observable<T>, defaultValue?: T): ResourceRef<T | undefined> {
  const version = inject(DataVersion);
  const resource = rxResource<T, P>({
    params,
    stream: ({ params: p }) => stream(p as NonNullable<P>),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  } as Parameters<typeof rxResource<T, P>>[0]);

  let first = true;
  effect(() => {
    version.value();
    if (first) {
      first = false;
      return;
    }
    untracked(() => resource.reload());
  });
  return resource;
}
