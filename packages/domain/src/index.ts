export interface BootstrapInfo {
  readonly label: string;
  readonly referenceData: 'unavailable';
}

export interface BootstrapInfoProvider {
  getInfo(): BootstrapInfo;
}
