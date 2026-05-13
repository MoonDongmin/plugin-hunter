import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  clearSavedLang,
  getConfigPath,
  getLang,
  isSupportedLang,
  type Lang,
  L,
  readSavedLang,
  resolveLang,
  saveLang,
  setLang,
  SUPPORTED_LANGS,
} from '../i18n/index.ts';
import { c, icon } from './ui.ts';

interface LangCommandOptions {
  reset?: boolean;
}

export async function runLangCommand(value: string | undefined, opts: LangCommandOptions): Promise<number> {
  if (opts.reset) {
    clearSavedLang();
    const next = resolveLang();
    setLang(next);
    process.stdout.write(`${c.green(icon.check)} ${L('Reset language preference.', '언어 설정을 초기화했습니다.')} `);
    process.stdout.write(`${L('Now using', '현재 적용')}: ${c.boldCyan(next)}\n`);
    return 0;
  }

  if (!value) {
    const saved = readSavedLang();
    const effective = getLang();
    process.stdout.write(`${L('Effective language', '현재 적용된 언어')}:  ${c.boldCyan(effective)}\n`);
    process.stdout.write(
      `${L('Saved preference', '저장된 설정')}:    ${saved ? c.cyan(saved) : c.dim(L('(auto-detect)', '(자동 감지)'))}\n`,
    );
    process.stdout.write(`${L('Config file', '설정 파일')}:         ${c.dim(getConfigPath())}\n\n`);
    process.stdout.write(`${c.dim(L('Usage:', '사용법:'))}\n`);
    process.stdout.write(`  ${c.cyan('ph lang en')}        ${c.dim(L('# switch to English', '# 영어로 전환'))}\n`);
    process.stdout.write(`  ${c.cyan('ph lang ko')}        ${c.dim(L('# switch to Korean', '# 한국어로 전환'))}\n`);
    process.stdout.write(`  ${c.cyan('ph lang --reset')}   ${c.dim(L('# back to auto-detect', '# 자동 감지로 복귀'))}\n`);
    return 0;
  }

  if (!isSupportedLang(value)) {
    process.stderr.write(
      `${c.red(icon.cross)} ${L('Unsupported language', '지원하지 않는 언어')}: ${value}. ` +
        `${L('Choose one of', '사용 가능한 언어')}: ${SUPPORTED_LANGS.join(', ')}\n`,
    );
    return 2;
  }

  saveLang(value);
  setLang(value);
  process.stdout.write(`${c.green(icon.check)} ${L('Language saved', '언어 설정 저장됨')}: ${c.boldCyan(value)}\n`);
  return 0;
}

/**
 * First-run TTY prompt: if neither saved config nor PH_LANG is set, ask the
 * user once which language they prefer. Non-interactive/CI environments fall
 * straight through to auto-detection (handled by resolveLang).
 */
export async function maybeFirstRunPrompt(): Promise<Lang | null> {
  if (readSavedLang()) return null;
  if (process.env.PH_LANG) return null;
  if (!input.isTTY || !output.isTTY) return null;

  process.stderr.write(`\n${c.boldCyan('plugin-hunter')}  Choose language / 언어 선택\n`);
  process.stderr.write(`  ${c.cyan('1')}) English ${c.dim('(default)')}\n`);
  process.stderr.write(`  ${c.cyan('2')}) 한국어\n`);

  const rl = createInterface({ input, output });
  let answer = '';
  try {
    answer = (await rl.question(`${c.dim('Enter to skip')}: `)).trim().toLowerCase();
  } finally {
    rl.close();
  }

  let chosen: Lang | null = null;
  if (answer === '2' || answer === 'ko' || answer === 'kr' || answer.startsWith('한')) {
    chosen = 'ko';
  } else if (answer === '1' || answer === 'en') {
    chosen = 'en';
  }
  if (chosen) {
    saveLang(chosen);
    setLang(chosen);
    process.stderr.write(`${c.green(icon.check)} ${chosen === 'ko' ? '언어 설정 저장됨' : 'Language saved'}: ${c.boldCyan(chosen)}\n\n`);
  }
  return chosen;
}
