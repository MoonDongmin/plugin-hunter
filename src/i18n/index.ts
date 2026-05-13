import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type Lang = 'en' | 'ko';
export const SUPPORTED_LANGS = ['en', 'ko'] as const;

const CONFIG_DIR = join(homedir(), '.ph');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

interface ConfigShape {
  lang?: Lang;
}

let currentLang: Lang = 'en';

export function isSupportedLang(v: string | undefined | null): v is Lang {
  if (!v) return false;
  return (SUPPORTED_LANGS as readonly string[]).includes(v);
}

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

/**
 * Inline language helper. Pick translation by the current global lang.
 *   L('Hello', '안녕')  → 'Hello' when lang=en, '안녕' when lang=ko
 *
 * Use this for short UI strings; long prompts (e.g. judge prompts) should
 * live in their own per-lang files.
 */
export function L(en: string, ko: string): string {
  return currentLang === 'ko' ? ko : en;
}

function loadConfig(): ConfigShape {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as ConfigShape;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeConfig(cfg: ConfigShape): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(dirname(CONFIG_PATH))) mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

export function readSavedLang(): Lang | null {
  const cfg = loadConfig();
  return isSupportedLang(cfg.lang) ? cfg.lang : null;
}

export function saveLang(lang: Lang): void {
  const cfg = loadConfig();
  cfg.lang = lang;
  writeConfig(cfg);
}

export function clearSavedLang(): void {
  if (!existsSync(CONFIG_PATH)) return;
  const cfg = loadConfig();
  delete cfg.lang;
  writeConfig(cfg);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Lang resolution priority (high → low):
 *   1) explicit (CLI --lang flag)
 *   2) PH_LANG env
 *   3) saved config (~/.ph/config.json)
 *   4) system locale (process.env.LANG / LC_ALL — ko* → ko)
 *   5) 'en' default
 */
export function resolveLang(explicit?: string | undefined): Lang {
  if (isSupportedLang(explicit)) return explicit;
  if (isSupportedLang(process.env.PH_LANG)) return process.env.PH_LANG as Lang;
  const saved = readSavedLang();
  if (saved) return saved;
  const sys = process.env.LANG ?? process.env.LC_ALL ?? '';
  if (/^ko/i.test(sys)) return 'ko';
  return 'en';
}
