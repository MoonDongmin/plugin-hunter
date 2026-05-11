import {
  copyFileSync,
  existsSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const README = resolve(ROOT, 'README.md');
const NPM_README = resolve(ROOT, 'npm-readme.md');
const BACKUP = resolve(ROOT, '.readme.md.bak');

type Mode = 'swap' | 'restore';

const mode = process.argv[2] as Mode | undefined;

function fail(message: string): never {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

function swap(): void {
  if (!existsSync(NPM_README)) {
    fail(`npm-readme.md not found at ${NPM_README}`);
  }
  if (!existsSync(README)) {
    fail(`README.md not found at ${README}`);
  }

  if (existsSync(BACKUP)) {
    process.stdout.write(
      '↻ .readme.md.bak already exists — assuming previous swap was not restored. Skipping backup.\n',
    );
  } else {
    renameSync(README, BACKUP);
  }

  copyFileSync(NPM_README, README);
  process.stdout.write('✓ README.md swapped to npm version (backup at .readme.md.bak)\n');
}

function restore(): void {
  if (!existsSync(BACKUP)) {
    process.stdout.write('↻ No .readme.md.bak found — nothing to restore.\n');
    return;
  }

  if (existsSync(README)) {
    unlinkSync(README);
  }
  renameSync(BACKUP, README);
  process.stdout.write('✓ README.md restored from backup\n');
}

if (mode === 'swap') {
  swap();
} else if (mode === 'restore') {
  restore();
} else {
  fail(
    `Unknown mode: "${mode ?? '(missing)'}". Usage: bun run scripts/swap-readme-for-publish.ts <swap|restore>`,
  );
}
