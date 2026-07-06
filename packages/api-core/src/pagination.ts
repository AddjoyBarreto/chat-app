const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export function clampPageSize(limit?: number, fallback = DEFAULT_PAGE_SIZE): number {
  if (limit === undefined || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_PAGE_SIZE);
}
