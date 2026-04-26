export interface GitHubRepo {
  owner: string;
  repo: string;
  cloneUrl: string;
  displayName: string;
}

export function parseGitHubUrl(input: string): GitHubRepo {
  const trimmed = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');

  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    return {
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      displayName: `${owner}/${repo}`,
    };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)/);
  if (sshMatch?.[1] && sshMatch[2]) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return {
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      displayName: `${owner}/${repo}`,
    };
  }

  const shorthandMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthandMatch?.[1] && shorthandMatch[2]) {
    const owner = shorthandMatch[1];
    const repo = shorthandMatch[2];
    return {
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      displayName: `${owner}/${repo}`,
    };
  }

  throw new Error(`Not a valid GitHub URL or owner/repo shorthand: ${input}`);
}
