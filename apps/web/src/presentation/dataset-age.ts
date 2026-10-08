export function datasetAgeText(downloadedAt: string): string {
  const days = Math.floor(
    (Date.now() - Date.parse(downloadedAt)) / (24 * 60 * 60 * 1000),
  );
  if (!Number.isFinite(days) || days < 0) return 'age unknown';
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
