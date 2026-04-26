import { existsSync, statSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getHistoryPath, loadHistory } from '../state/history.ts';
import { getRegistryPath, loadRegistry } from '../state/registry.ts';

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

interface ClearCommandOptions {
  yes?: boolean;
}

export async function runClearCommand(opts: ClearCommandOptions): Promise<number> {
  const registryPath = getRegistryPath();
  const historyPath = getHistoryPath();
  const registryCount = Object.keys(loadRegistry().entries).length;
  const historyCount = loadHistory().length;

  if (registryCount === 0 && historyCount === 0) {
    process.stdout.write(`${C.dim}초기화할 검사 기록이 없습니다.${C.reset}\n`);
    return 0;
  }

  process.stdout.write(`${C.bold}${C.cyan}Plugin Hunter — 검사 기록 초기화${C.reset}\n`);
  process.stdout.write(`  ${C.bold}registry${C.reset}  ${C.yellow}${registryCount}${C.reset}개 항목  ${C.dim}${registryPath}${C.reset}\n`);
  process.stdout.write(`  ${C.bold}history${C.reset}   ${C.yellow}${historyCount}${C.reset}개 항목  ${C.dim}${historyPath}${C.reset}\n`);

  if (!opts.yes) {
    const confirmed = await confirm(`\n${C.red}정말로 초기화하시겠습니까?${C.reset} (y/N): `);
    if (!confirmed) {
      process.stdout.write(`${C.dim}취소되었습니다.${C.reset}\n`);
      return 1;
    }
  }

  const removedRegistry = removeIfFile(registryPath);
  const removedHistory = removeIfFile(historyPath);

  process.stdout.write(`\n${C.green}✓${C.reset} 초기화 완료\n`);
  process.stdout.write(`  ${removedRegistry ? `${C.green}삭제${C.reset}` : `${C.gray}없음${C.reset}`}  ${registryPath}\n`);
  process.stdout.write(`  ${removedHistory ? `${C.green}삭제${C.reset}` : `${C.gray}없음${C.reset}`}  ${historyPath}\n`);
  return 0;
}

function removeIfFile(path: string): boolean {
  if (!existsSync(path)) return false;
  if (!statSync(path).isFile()) return false;
  unlinkSync(path);
  return true;
}

async function confirm(prompt: string): Promise<boolean> {
  if (!input.isTTY) return false;
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}
