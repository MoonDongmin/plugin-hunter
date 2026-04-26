import type { ScanReport } from '../rules/types.ts';

export function renderJson(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}
