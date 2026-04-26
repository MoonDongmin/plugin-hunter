import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { HistoryEntry } from './types.ts';

const HISTORY_DIR = join(homedir(), '.ph');
const HISTORY_PATH = join(HISTORY_DIR, 'history.json');
const MAX_HISTORY = 500;

interface HistoryFile {
  entries: HistoryEntry[];
}

export function loadHistory(): HistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) as HistoryFile;
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries;
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): void {
  const entries = loadHistory();
  entries.push(entry);
  // 최근 MAX_HISTORY 개만 보관 (앞에서 자르기)
  const capped = entries.length > MAX_HISTORY ? entries.slice(-MAX_HISTORY) : entries;
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
  if (!existsSync(dirname(HISTORY_PATH))) mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  const data: HistoryFile = { entries: capped };
  writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export function getHistoryPath(): string {
  return HISTORY_PATH;
}
