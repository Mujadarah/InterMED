import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

/**
 * Shared route-focus bookkeeping.
 *
 * The App focuses `main` when the pathname changes, but a lazily loaded route
 * renders its heading only after its chunk resolves, so by then that focus move
 * has already happened. A route page that mounts its `h1[tabindex="-1"]` later
 * takes the focus back if the App is still waiting for the route heading and
 * the user has not reached something themselves.
 */
export interface RouteFocusApi {
  /** Focus a route heading now, if this pathname still owes one. */
  claim: () => boolean;
  /** Record that this pathname change still owes its heading a focus. */
  request: () => void;
}

export const RouteFocusContext = createContext<RouteFocusApi | null>(null);

/**
 * Whether focus has moved somewhere the user is working with. Focus resting on
 * the document body, on `<main>`, on the route loading placeholder or on the
 * heading of a previous page state was never moved by the user, so a state
 * change may move it. Anything else - a link, a button, an input - was reached
 * deliberately and keeps its focus.
 */
function focusIsUnclaimed(active: Element | null): boolean {
  if (active === null || active === document.body) return true;
  if (active instanceof HTMLHeadingElement && active.tabIndex === -1)
    return true;
  if (active instanceof HTMLElement && active.tagName === 'MAIN') return true;
  if (
    active instanceof HTMLElement &&
    active.closest('[data-route-loading]') !== null
  )
    return true;
  return false;
}

/** Create the route-focus bookkeeping one router instance owns. */
export function useRouteFocus(): RouteFocusApi {
  const [pending, setPending] = useState(false);
  const claim = useCallback((): boolean => {
    if (!pending) return false;
    if (!focusIsUnclaimed(document.activeElement)) return false;
    setPending(false);
    return true;
  }, [pending]);
  const request = useCallback(() => setPending(true), []);
  return { claim, request };
}

/**
 * Take the pending route focus for a heading that has just rendered.
 *
 * Route pages call this from an effect after their `h1[tabindex="-1"]` exists,
 * which is the first moment focus can land on it. The focus is only taken while
 * the App still owes one for this pathname and the user has not moved focus
 * themselves, so a user who tabbed or clicked elsewhere keeps it.
 */
export function useRouteHeadingFocus(): void {
  const api = useContext(RouteFocusContext);
  const claim = api?.claim;
  useEffect(() => {
    if (!claim?.()) return;
    document.querySelector<HTMLElement>('main h1[tabindex="-1"]')?.focus();
  }, [claim]);
}
