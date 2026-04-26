import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Registry, RegistryEntry } from './types.ts';

const REGISTRY_DIR = join(homedir(), '.ph');
const REGISTRY_PATH = join(REGISTRY_DIR, 'registry.json');

export function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) return { entries: {} };
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Registry;
    if (!parsed.entries || typeof parsed.entries !== 'object') return { entries: {} };
    // 호환되지 않는 옛 스키마(id 필드 없음)는 그냥 버린다 — 첫 watch 시 재구축됨.
    const compat: Record<string, RegistryEntry> = {};
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.source) {
        compat[key] = entry;
      }
    }
    return { entries: compat };
  } catch {
    return { entries: {} };
  }
}

export function saveRegistry(registry: Registry): void {
  if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });
  if (!existsSync(dirname(REGISTRY_PATH))) mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

export function upsertEntry(entry: RegistryEntry): void {
  const reg = loadRegistry();
  reg.entries[entry.id] = entry;
  saveRegistry(reg);
}

export function getEntryById(id: string): RegistryEntry | null {
  const reg = loadRegistry();
  return reg.entries[id] ?? null;
}

export function getEntryByPluginName(name: string): RegistryEntry | null {
  const reg = loadRegistry();
  const lower = name.toLowerCase();
  for (const e of Object.values(reg.entries)) {
    if (e.pluginName.toLowerCase() === lower) return e;
  }
  for (const e of Object.values(reg.entries)) {
    if (e.id.toLowerCase().startsWith(lower + '@')) return e;
  }
  return null;
}

export interface HashDiff {
  added: string[];
  removed: string[];
  modified: string[];
}

export function diffHashes(prev: Record<string, string>, next: Record<string, string>): HashDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  for (const [path, hash] of Object.entries(next)) {
    if (!(path in prev)) added.push(path);
    else if (prev[path] !== hash) modified.push(path);
  }
  for (const path of Object.keys(prev)) {
    if (!(path in next)) removed.push(path);
  }
  return { added, removed, modified };
}

export function getRegistryPath(): string {
  return REGISTRY_PATH;
}
