import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createTempDir(prefix = 'plugin-hunter-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
