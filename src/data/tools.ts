import { CF_PAGES_BRANCH, getSecret } from 'astro:env/server';
import fixture from './tools.fixture.json';

export type Tool = {
  name: string;
  description: string;
  /** Empty when the repository is private. */
  githubUrl: string;
  websiteUrl?: string;
  category: 'AI' | 'Audio' | 'Documents' | 'Games' | 'Images' | 'Productivity' | 'Text' | 'Web' | 'Developer';
  tags: string[];
  /** Date the tool was added to the directory (YYYY-MM-DD). */
  added: string;
  repoPrivate: boolean;
};

/**
 * Tools come from the D1 database behind the sync Worker (see sync/). They are
 * read once per build, so the site stays static and the nightly sync triggers
 * a rebuild to publish changes. `astro dev` and Pages preview builds fall back
 * to a local snapshot; production builds fail instead of shipping stale data.
 */
async function loadTools(): Promise<Tool[]> {
  const url = getSecret('TOOLS_API_URL');
  if (!url) {
    if (import.meta.env.DEV || (CF_PAGES_BRANCH && CF_PAGES_BRANCH !== 'main')) {
      console.warn('TOOLS_API_URL is not set; using src/data/tools.fixture.json');
      return fixture as Tool[];
    }
    throw new Error('TOOLS_API_URL is not set. Point it at the sync Worker, e.g. https://tools-directory-sync.alexander-df0.workers.dev/api/tools');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Loading tools from ${url} failed with ${res.status}`);
  return (await res.json()) as Tool[];
}

export const tools: Tool[] = await loadTools();
