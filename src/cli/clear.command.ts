import { existsSync, statSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getHistoryPath, loadHistory } from '../state/history.ts';
import { getRegistryPath, loadRegistry } from '../state/registry.ts';
import { box, c, hr, icon, termWidth } from './ui.ts';

interface ClearCommandOptions {
  yes?: boolean;
}

export async function runClearCommand(opts: ClearCommandOptions): Promise<number> {
  const registryPath = getRegistryPath();
  const historyPath = getHistoryPath();
  const registryCount = Object.keys(loadRegistry().entries).length;
  const historyCount = loadHistory().length;
  const w = termWidth();

  if (registryCount === 0 && historyCount === 0) {
    process.stdout.write(`\n${c.dim('초기화할 검사 기록이 없습니다.')}\n\n`);
    return 0;
  }

  process.stdout.write('\n');
  process.stdout.write(box({
    title: `${c.yellow(icon.warn)} 검사 기록 초기화`,
    lines: [
      `${c.bold('registry')}  ${c.yellow(String(registryCount))} 개 항목`,
      `          ${c.dim(registryPath)}`,
      '',
      `${c.bold('history')}   ${c.yellow(String(historyCount))} 개 항목`,
      `          ${c.dim(historyPath)}`,
    ],
    kind: 'warn',
    width: w,
  }) + '\n\n');

  if (!opts.yes) {
    const confirmed = await confirm(`${c.yellow(icon.warn)} ${c.bold('정말로 초기화하시겠습니까?')} ${c.dim('(y/N): ')}`);
    if (!confirmed) {
      process.stdout.write(`${c.dim('취소되었습니다.')}\n\n`);
      return 1;
    }
  }

  const removedRegistry = removeIfFile(registryPath);
  const removedHistory = removeIfFile(historyPath);

  process.stdout.write('\n');
  process.stdout.write(`${c.green(icon.check)} ${c.boldGreen('초기화 완료')}\n`);
  process.stdout.write(hr(w) + '\n');
  process.stdout.write(`  ${removedRegistry ? c.green(icon.check) : c.gray('-')}  ${c.dim(registryPath)}\n`);
  process.stdout.write(`  ${removedHistory ? c.green(icon.check) : c.gray('-')}  ${c.dim(historyPath)}\n\n`);
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
