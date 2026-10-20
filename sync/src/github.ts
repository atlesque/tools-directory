import type { Ctx } from './context.ts';

export type Repo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  topics?: string[];
};

async function gh({ env, fetch }: Ctx, path: string, accept = 'application/vnd.github+json') {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: accept,
      'User-Agent': 'tools-directory-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

/** Every repository the token can see for the configured affiliations, public and private. */
export async function listRepos(ctx: Ctx): Promise<Repo[]> {
  const repos: Repo[] = [];
  for (let page = 1; ; page++) {
    const res = await gh(ctx, `/user/repos?affiliation=${ctx.env.GITHUB_AFFILIATION}&per_page=100&page=${page}`);
    if (!res.ok) throw new Error(`GitHub /user/repos ${res.status}: ${await res.text()}`);
    const batch = (await res.json()) as Repo[];
    repos.push(...batch);
    if (batch.length < 100) return repos;
  }
}

/** README as plain text, trimmed for the AI prompt. Empty when the repo has none. */
export async function readme(ctx: Ctx, fullName: string, maxChars = 6000): Promise<string> {
  const res = await gh(ctx, `/repos/${fullName}/readme`, 'application/vnd.github.raw+json');
  if (!res.ok) return '';
  return (await res.text()).slice(0, maxChars);
}
