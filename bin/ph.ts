#!/usr/bin/env -S bun run
import { runCli } from '../src/cli/index.ts';

runCli(process.argv).then(code => {
  process.exit(code);
}).catch(err => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`✗ unhandled: ${msg}\n`);
  process.exit(2);
});
