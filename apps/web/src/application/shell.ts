export interface ShellState {
  readonly availability:
    'development' | 'unsupported' | 'installing' | 'ready' | 'unavailable';
  readonly update: 'none' | 'available' | 'blocked' | 'failed' | 'reload';
  readonly version?: string;
  readonly usingPrior?: boolean;
  readonly repairFailed?: boolean;
  readonly canInstall: boolean;
}
export interface ShellController {
  getSnapshot: () => ShellState;
  subscribe: (listener: () => void) => () => void;
  check: () => Promise<void>;
  repair: () => void;
  activate: () => void;
  reload: () => void;
  install: () => Promise<void>;
}
const developmentState: ShellState = {
  availability: 'development',
  update: 'none',
  canInstall: false,
};
export const developmentShell: ShellController = {
  /** Return the shared snapshot reporting development mode and no install prompt. */
  getSnapshot: () => developmentState,
  /** Ignore subscriptions and return a no-op unsubscribe function. */
  subscribe: () => () => {},
  /** Resolve without checking for worker updates. */
  check: async () => {},
  /** Leave shell caches unchanged. */
  repair: () => {},
  /** Do not request worker activation. */
  activate: () => {},
  /** Leave the current page loaded. */
  reload: () => {},
  /** Resolve without prompting for installation. */
  install: async () => {},
};
