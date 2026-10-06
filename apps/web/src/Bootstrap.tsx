import { mockBootstrapProvider } from '@intermed/data-access';
import { createServices } from './application/services';
import { App } from './presentation/App';
import { parseConfig } from './config';
import type { AppConfig } from './config';
import type { ShellController } from './application/shell';
import { developmentShell } from './application/shell';

/**
 * Validate the public environment and render the shell with mock services.
 * Render a configuration alert when validation fails.
 * Use the supplied shell controller, defaulting to inert development actions.
 */
export function Bootstrap({
  env,
  shell = developmentShell,
}: {
  env: Record<string, unknown>;
  shell?: ShellController;
}) {
  let config: AppConfig;
  try {
    config = parseConfig(env);
  } catch {
    return (
      <div className="shell">
        <p className="development-notice">Development · Not for clinical use</p>
        <main>
          <div role="alert">
            <h1>Configuration unavailable</h1>
            <p>
              Use the documented contributor mock configuration and restart the
              app. No cloud services have been enabled.
            </p>
          </div>
        </main>
      </div>
    );
  }
  return (
    <App
      services={createServices(config, mockBootstrapProvider)}
      shell={shell}
    />
  );
}
