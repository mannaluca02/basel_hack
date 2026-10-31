import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
  Route,
} from '@angular/router';

/** Route `data` flag: keep the component alive when the user leaves the route. */
export const KEEP_ALIVE = 'keepAlive';

/**
 * Detaches routes flagged with `data: { keepAlive: true }` instead of destroying them, so a
 * workspace tab keeps its component state (open cards, inputs, chart selection) across tab
 * switches. Scroll position is restored separately by the shell: a detached view loses it.
 */
@Injectable()
export class KeepAliveRouteReuseStrategy extends BaseRouteReuseStrategy {
  private readonly handles = new Map<Route, DetachedRouteHandle>();

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return route.data[KEEP_ALIVE] === true;
  }

  override store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    if (!route.routeConfig) return;
    if (handle) this.handles.set(route.routeConfig, handle);
    else this.handles.delete(route.routeConfig);
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return !!route.routeConfig && this.handles.has(route.routeConfig);
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return (route.routeConfig && this.handles.get(route.routeConfig)) ?? null;
  }
}
