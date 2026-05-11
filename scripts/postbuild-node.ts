import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NODE_SHEBANG = '#!/usr/bin/env node';

const target = process.argv[2] ?? 'dist/cli.js';
const absolute = resolve(process.cwd(), target);

const original = readFileSync(absolute, 'utf8');
const withoutShebang = original.startsWith('#!')
  ? original.slice(original.indexOf('\n') + 1)
  : original;

writeFileSync(absolute, `${NODE_SHEBANG}\n${withoutShebang}`);
chmodSync(absolute, 0o755);

process.stdout.write(`✓ rewrote shebang on ${target}\n`);
