import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunProcessOptions {
  timeoutMs?: number;
  /**
   * spawn 자식의 cwd 를 명시적으로 빈 임시 디렉토리로 격리할지 여부.
   * judge CLI (claude/codex/gemini) 호출 시 부모 cwd 의 CLAUDE.md/AGENTS.md/hooks 등이
   * 자식 LLM 컨텍스트에 자동 주입되어 분석 결과가 오염되는 것을 막기 위한 안전장치.
   */
  isolateCwd?: boolean;
  /**
   * 추가 환경변수. 부모 env 위에 머지됨.
   */
  extraEnv?: Record<string, string>;
}

export function runProcess(
  command: string,
  args: string[],
  input?: string,
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const isolatedCwd = options.isolateCwd ? mkdtempSync(join(tmpdir(), 'ph-judge-cwd-')) : null;
    const env = options.extraEnv ? { ...process.env, ...options.extraEnv } : undefined;
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(isolatedCwd ? { cwd: isolatedCwd } : {}),
      ...(env ? { env } : {}),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const cleanup = (): void => {
      if (isolatedCwd) {
        try {
          rmSync(isolatedCwd, { recursive: true, force: true });
        } catch {
          // 임시 디렉토리 청소는 best-effort.
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const finish = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout.push(toBuffer(chunk));
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr.push(toBuffer(chunk));
    });
    child.once('error', (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(error);
    });
    child.once('close', (exitCode: number | null) => {
      finish({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
      });
    });

    child.stdin?.end(input ?? '');
  });
}

export async function commandExists(bin: string): Promise<boolean> {
  const result = await runProcess('sh', ['-lc', `command -v ${quoteShell(bin)}`], undefined, { timeoutMs: 10_000 });
  return result.exitCode === 0;
}

function toBuffer(chunk: Buffer | string): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
