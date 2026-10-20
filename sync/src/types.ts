export const CATEGORIES = ['AI', 'Audio', 'Documents', 'Games', 'Images', 'Productivity', 'Text', 'Web', 'Developer'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Env {
  DB: D1Database;
  AI: Ai;
  GITHUB_TOKEN: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  PAGES_DEPLOY_HOOK?: string;
  SYNC_TOKEN?: string;
  GITHUB_AFFILIATION: string;
  AI_MODEL: string;
  LOCAL_TIMEZONE: string;
  LOCAL_HOUR: string;
  MAX_SUBREQUESTS?: string;
  TOOL_DOMAINS?: string;
  IGNORE_HOSTS?: string;
  OPT_IN_TOPIC?: string;
  OPT_OUT_TOPIC?: string;
}

/** Shape served by GET /api/tools and read by the Astro build. */
export type ApiTool = {
  name: string;
  description: string;
  githubUrl: string;
  websiteUrl?: string;
  category: Category;
  tags: string[];
  added: string;
  repoPrivate: boolean;
};

export type ToolRow = {
  id: number;
  name: string;
  description: string;
  github_url: string;
  website_url: string | null;
  category: Category;
  tags: string;
  added: string;
  repo_private: number;
  hidden: number;
};

export type SyncReport = {
  added: { repo: string; name: string; websiteUrl: string; category: string; via: string }[];
  updated: { repo: string; change: string }[];
  skipped: { repo: string; reason: string }[];
  errors: string[];
  warnings: string[];
};
