import { loadHistory, getHistoryPath } from '../state/history.ts';
import { alignColumns, c, hr, icon, statusBadge, termWidth, truncate } from './ui.ts';

interface HistoryCommandOptions {
  limit?: string;
  id?: string;
}

export function runHistoryCommand(opts: HistoryCommandOptions): number {
  const all = loadHistory();
  const w = termWidth();

  if (all.length === 0) {
    process.stdout.write(`\n${c.boldCyan('plugin-hunter')} ${c.dim('— 검사 이력')}\n`);
    process.stdout.write(hr(w) + '\n');
    process.stdout.write(`  ${c.dim('이력이 없습니다.')}\n`);
    process.stdout.write(`  ${c.dim('파일 위치:')} ${c.cyan(getHistoryPath())}\n`);
    process.stdout.write(`  ${c.dim(icon.arrow + ' 첫 검사:')} ${c.cyan('ph scan claude <github-url>')}\n\n`);
    return 0;
  }

  const filtered = opts.id
    ? all.filter(e => e.id === opts.id || e.pluginName === opts.id)
    : all;

  const limit = parseLimit(opts.limit, 20);
  // 최근 → 오래된 순으로
  const view = filtered.slice(-limit).reverse();

  process.stdout.write(`\n${c.boldCyan('plugin-hunter')} ${c.dim('— 검사 이력')} ${c.dim(`(최근 ${view.length} / 전체 ${filtered.length})`)}\n`);
  process.stdout.write(hr(w) + '\n');

  // 컬럼: timestamp, status, plugin id, severities, changed
  const idMax = Math.max(20, Math.min(40, Math.floor(w * 0.4)));
  const rows = view.map(e => {
    const fc = e.findingCount;
    const counts = [
      fc.critical > 0 ? c.boldRed(`c${fc.critical}`) : c.dim('c0'),
      fc.high > 0 ? c.boldMagenta(`h${fc.high}`) : c.dim('h0'),
      fc.medium > 0 ? c.boldYellow(`m${fc.medium}`) : c.dim('m0'),
      fc.low > 0 ? c.boldGray(`l${fc.low}`) : c.dim('l0'),
    ].join(' ');
    const changed = e.changedFiles !== undefined && e.changedFiles > 0
      ? c.yellow(`Δ${e.changedFiles}`)
      : c.dim(' — ');
    return [
      c.gray(formatTs(e.scannedAt)),
      statusBadge(e.status),
      c.bold(truncate(e.id, idMax)),
      counts,
      changed,
    ];
  });

  const aligned = alignColumns(rows, 2);
  for (const line of aligned) {
    process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write('\n');
  process.stdout.write(`  ${c.dim('표 범례: ')}${c.boldRed('c')}${c.dim('=critical ')}${c.boldMagenta('h')}${c.dim('=high ')}${c.boldYellow('m')}${c.dim('=medium ')}${c.boldGray('l')}${c.dim('=low  ')}${c.yellow('Δ')}${c.dim('=변경된 파일 수')}\n\n`);
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
