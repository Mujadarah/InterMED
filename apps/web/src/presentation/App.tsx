import type { AppServices } from '../application/services';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import type { ShellController } from '../application/shell';
import { developmentShell } from '../application/shell';
import { ShellStatus } from './ShellStatus';

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
  useEffect(() => {
    if (previousPath.current !== pathname) main.current?.focus();
    previousPath.current = pathname;
  }, [pathname]);

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
          <NavLink to="/status" tabIndex={0}>
            Development status
          </NavLink>
        </nav>
      </header>
      <main ref={main} id="content" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <section className="intro" aria-labelledby="overview-title">
                <h1 id="overview-title">A foundation for InterMED</h1>
                <p className="lead">
                  A future Romanian medication reference, built with care.
                </p>
                <p>
                  This development build contains a navigation shell only. It
                  has no clinical reference data and must not guide patient
                  care.
                </p>
                <div className="scope-note">
                  <h2>What you can explore</h2>
                  <p>
                    Navigate this shell and read its current limitations.
                    Medication lookup, interaction checking and calculators are
                    not available.
                  </p>
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
                <h1 id="status-title">Development status</h1>
                <p className="lead">Development PWA shell</p>
                <p>
                  Medication lookup and interaction checking are unavailable. No
                  clinical capability has been validated.
                </p>
                <dl className="status-list">
                  <div>
                    <dt>Reference data</dt>
                    <dd>Unavailable</dd>
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
                <p>
                  This build uses contributor mock mode without accounts or
                  cloud connections. Future clinical content requires permitted
                  sources and clinical review.
                </p>
                <h2>Install the development shell</h2>
                <p>
                  iPhone/iPad Safari: Share → Add to Home Screen. If offered,
                  enable Open as Web App, then Add.
                </p>
                <p>
                  On other browsers, use Install development app when this
                  browser offers it. Otherwise check its address-bar or menu
                  installation option. Some browsers offer no installation; you
                  can continue in a tab. Installation flows differ.
                </p>
                <p>
                  Connect first and wait for “Shell available offline”. A
                  brand-new offline visit cannot load this page without a
                  previously cached worker. Installing does not download
                  medications.
                </p>
                <p>
                  Private mode, quota limits or browser eviction can remove or
                  restrict storage. Installed and tab modes may use different
                  storage. Offline availability is checked now, not guaranteed
                  permanently.
                </p>
                <p>
                  Temporary development artwork: original I monogram, not
                  approved final branding.
                </p>
              </section>
            }
          />
          <Route
            path="*"
            element={
              <section>
                <h1>Page unavailable</h1>
                <p>This route is not part of the development shell.</p>
                <Link to="/" tabIndex={0}>
                  Return to overview
                </Link>
              </section>
            }
          />
        </Routes>
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
