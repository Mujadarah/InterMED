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
  getSnapshot: () => developmentState,
  subscribe: () => () => {},
  check: async () => {},
  repair: () => {},
  activate: () => {},
  reload: () => {},
  install: async () => {},
};
