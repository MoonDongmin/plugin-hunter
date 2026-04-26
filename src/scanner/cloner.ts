import { simpleGit } from 'simple-git';
import { createTempDir } from '../util/tmp.ts';
import type { GitHubRepo } from '../util/github.ts';

export interface ClonedRepo {
  repo: GitHubRepo;
  localPath: string;
  commitSha: string;
}

export async function shallowClone(repo: GitHubRepo): Promise<ClonedRepo> {
  const localPath = await createTempDir(`ph-${repo.owner}-${repo.repo}-`);
  const git = simpleGit();
  await git.clone(repo.cloneUrl, localPath, ['--depth=1', '--single-branch']);
  const localGit = simpleGit(localPath);
  const commitSha = (await localGit.revparse(['HEAD'])).trim();
  return { repo, localPath, commitSha };
}
