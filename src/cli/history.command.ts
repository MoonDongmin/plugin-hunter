import { loadHistory, getHistoryPath } from '../state/history.ts';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

interface HistoryCommandOptions {
  limit?: string;
  id?: string;
}

export function runHistoryCommand(opts: HistoryCommandOptions): number {
  const all = loadHistory();
  if (all.length === 0) {
    process.stdout.write(`${C.dim}이력이 없습니다 (${getHistoryPath()})${C.reset}\n`);
    return 0;
  }

  const filtered = opts.id
    ? all.filter(e => e.id === opts.id || e.pluginName === opts.id)
    : all;

  const limit = parseLimit(opts.limit, 20);
  // 최근 → 오래된 순으로
  const view = filtered.slice(-limit).reverse();

  process.stdout.write(`${C.bold}${C.cyan}Plugin Hunter — 검사 이력${C.reset} (최근 ${view.length}/${filtered.length})\n\n`);

  for (const e of view) {
    const status = e.status === 'unsafe'
      ? `${C.red}위험${C.reset}`
      : `${C.green}안전${C.reset}`;
    const ts = formatTs(e.scannedAt);
    const c = e.findingCount;
    const changed = e.changedFiles !== undefined && e.changedFiles > 0
      ? ` ${C.yellow}(변경 ${e.changedFiles})${C.reset}`
      : '';
    process.stdout.write(
      `  ${C.gray}${ts}${C.reset}  ${status}  ${C.bold}${e.id}${C.reset}  ${C.dim}c=${c.critical} h=${c.high} m=${c.medium} l=${c.low}${C.reset}${changed}\n`,
    );
  }
  return 0;
}

function parseLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
