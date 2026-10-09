import type { AppServices } from '../application/services';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router';
import { Component, lazy, Suspense, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ShellController } from '../application/shell';
import { developmentShell } from '../application/shell';
import { DatasetStatus } from './DatasetStatus';
import { RouteFocusContext, useRouteFocus } from './route-focus';
import { ShellStatus } from './ShellStatus';

// Both route pages are heavy and not needed for the shell's first paint.
// Loading them lazily keeps the initial JavaScript small; each route chunk is
// still precached by the public shell, so it loads offline after first visit.
const MedicationSearchPage = lazy(() =>
  import('./MedicationSearchPage').then((module) => ({
    default: module.MedicationSearchPage,
  })),
);
const MedicationDetailPage = lazy(() =>
  import('./MedicationDetailPage').then((module) => ({
    default: module.MedicationDetailPage,
  })),
);

/**
 * Calm placeholder while a lazily loaded route chunk arrives.
 * Announces politely, occupies the content area the route fills so the shell
 * does not jump, and never moves focus: the rendered route heading takes focus
 * once it appears.
 */
function RouteLoading() {
  return (
    <section className="route-loading" data-route-loading="" aria-busy="true">
      <p role="status">Loading…</p>
    </section>
  );
}

function MedicationDetailRoute({ services }: { services: AppServices }) {
  const { productId } = useParams();
  return (
    <MedicationDetailPage
      productId={productId ?? ''}
      dataset={services.dataset}
      detail={services.medicationDetail}
    />
  );
}

/**
 * Reload the document without letting a test stub reach `window`: the app path
 * reloads, and a caller may supply its own callback to observe the intent.
 */
function reloadPage(reload: () => void): void {
  if (reload === defaultReload) window.location.reload();
  else reload();
}

const defaultReload = () => window.location.reload();

interface RouteErrorBoundaryProps {
  children: ReactNode;
  /** Test seam: called instead of the real reload. */
  reload?: (() => void) | undefined;
}

interface RouteErrorBoundaryState {
  failed: boolean;
}

/**
 * Recovery screen for a route whose chunk could not be loaded. `Suspense`
 * has no opinion about a rejected `import()`, so a failed lazy chunk used to
 * blank the app. This keeps the header, navigation and footer usable and
 * offers a way back in, and it logs nothing: neither the failure reason nor
 * any product data belongs in the console.
 */
class Boundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    // Deliberately silent: no error details, no product data, no telemetry.
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="route-error" aria-labelledby="route-error-title">
        <h1 id="route-error-title" tabIndex={-1}>
          This page could not be loaded
        </h1>
        <p>
          Part of this app is unavailable in this browser right now. Its files
          may have been removed while you were offline. This is not a data
          problem and nothing you were looking at was changed.
        </p>
        <p>
          <button
            type="button"
            onClick={() => reloadPage(this.props.reload ?? defaultReload)}
          >
            Reload
          </button>{' '}
          <Link to="/status" tabIndex={0}>
            Check development status
          </Link>
        </p>
      </section>
    );
  }
}

/** Boundary keyed by route, so a route change resets a shown failure. */
export function RouteErrorBoundary({
  reload,
  children,
}: RouteErrorBoundaryProps) {
  const { pathname } = useLocation();
  return (
    <Boundary key={pathname} reload={reload}>
      {children}
    </Boundary>
  );
}

/**
 * Render the nonclinical navigation shell using the supplied services.
 * Require a router context and focus main content when the pathname changes.
 * Always render shell status for the supplied controller.
 */
export function App({
  services,
  shell = developmentShell,
}: {
  services: AppServices;
  shell?: ShellController;
}) {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  // A lazy route renders its heading only after its chunk resolves, which is
  // later than this effect. Record that the focus is still owed, and share it
  // with the route pages, which take it once their heading exists.
  const routeFocus = useRouteFocus();
  useEffect(() => {
    if (previousPath.current !== pathname) {
      const heading =
        main.current?.querySelector<HTMLElement>('h1[tabindex="-1"]');
      if (heading) heading.focus();
      else {
        // No heading yet: the route chunk is still arriving. Focus stays on
        // main, and the route page takes it once its heading renders.
        routeFocus.request();
        main.current?.focus();
      }
    }
    previousPath.current = pathname;
  }, [pathname, routeFocus]);

  return (
    <div className="shell">
      <a className="skip-link" href="#content" tabIndex={0}>
        Skip to content
      </a>
      <header className="header">
        <Link
          className="brand"
          to="/"
          aria-label="InterMED overview"
          tabIndex={0}
        >
          InterMED
        </Link>
        <p className="development-notice">Development · Not for clinical use</p>
        <nav aria-label="Main navigation">
          <NavLink to="/" end tabIndex={0}>
            Overview
          </NavLink>
          <NavLink to="/search" tabIndex={0}>
            Medication search
          </NavLink>
          <NavLink to="/status" tabIndex={0}>
            Development status
          </NavLink>
        </nav>
      </header>
      <main ref={main} id="content" tabIndex={-1}>
        <RouteFocusContext.Provider value={routeFocus}>
          <RouteErrorBoundary>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route
                  path="/"
                  element={
                    <section className="intro" aria-labelledby="overview-title">
                      <h1 id="overview-title" tabIndex={-1}>
                        A foundation for InterMED
                      </h1>
                      <p className="lead">
                        A future Romanian medication reference, built with care.
                      </p>
                      <p>
                        This development build contains a navigation shell only.
                        It has no clinical reference data and must not guide
                        patient care.
                      </p>
                      <div className="scope-note">
                        <h2>What you can explore</h2>
                        <p>
                          Local medication search reads candidates only from a
                          dataset already stored in this browser. It does not
                          provide clinical guidance. Interaction checking and
                          calculators are unavailable.
                        </p>
                        <Link to="/search" tabIndex={0}>
                          Search local medication data
                        </Link>
                        <br />
                        <Link to="/status" tabIndex={0}>
                          Read current limitations
                        </Link>
                      </div>
                      <p className="mode-label">{services.info.label}</p>
                    </section>
                  }
                />
                <Route
                  path="/status"
                  element={
                    <section aria-labelledby="status-title">
                      <h1 id="status-title" tabIndex={-1}>
                        Development status
                      </h1>
                      <p className="lead">Development PWA shell</p>
                      <p>
                        Local medication search uses only an active dataset
                        stored in this browser. Interaction checking is
                        unavailable. No clinical capability has been validated.
                      </p>
                      <dl className="status-list">
                        <div>
                          <dt>Medication data</dt>
                          <dd>Local browser data, when available</dd>
                        </div>
                        <div>
                          <dt>Offline use and installation</dt>
                          <dd>Public shell only, after successful caching</dd>
                        </div>
                        <div>
                          <dt>Patient information</dt>
                          <dd>No collection or storage</dd>
                        </div>
                      </dl>
                      <DatasetStatus dataset={services.dataset} />
                      <p>
                        This build uses contributor mock mode without accounts
                        or cloud connections. Future clinical content requires
                        permitted sources and clinical review.
                      </p>
                      <h2>Install the development shell</h2>
                      <p>
                        iPhone/iPad Safari: Share → Add to Home Screen. If
                        offered, enable Open as Web App, then Add.
                      </p>
                      <p>
                        On other browsers, use Install development app when this
                        browser offers it. Otherwise check its address-bar or
                        menu installation option. Some browsers offer no
                        installation; you can continue in a tab. Installation
                        flows differ.
                      </p>
                      <p>
                        Connect first and wait for “Shell available offline”. A
                        brand-new offline visit cannot load this page without a
                        previously cached worker. Installing does not download
                        medications.
                      </p>
                      <p>
                        Private mode, quota limits or browser eviction can
                        remove or restrict storage. Installed and tab modes may
                        use different storage. Offline availability is checked
                        now, not guaranteed permanently.
                      </p>
                      <p>
                        Temporary development artwork: original I monogram, not
                        approved final branding.
                      </p>
                    </section>
                  }
                />
                <Route
                  path="/search"
                  element={
                    <MedicationSearchPage
                      dataset={services.dataset}
                      search={services.medicationSearch}
                    />
                  }
                />
                <Route
                  path="/medication/:productId"
                  element={<MedicationDetailRoute services={services} />}
                />
                <Route
                  path="*"
                  element={
                    <section>
                      <h1 tabIndex={-1}>Page unavailable</h1>
                      <p>This route is not part of the development shell.</p>
                      <Link to="/" tabIndex={0}>
                        Return to overview
                      </Link>
                    </section>
                  }
                />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </RouteFocusContext.Provider>
        <ShellStatus shell={shell} />
      </main>
      <footer>
        <p>
          InterMED is pre-release software. No patient data, clinical datasets
          or cloud services are used in this build.
        </p>
      </footer>
    </div>
  );
}
