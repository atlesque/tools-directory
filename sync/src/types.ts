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
  /** Cloudflare Access team domain, e.g. https://atlesque.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application in front of the admin. */
  ACCESS_AUD?: string;
  /** Hostname that serves the admin page at its root. */
  ADMIN_HOST?: string;
  /** Comma-separated emails allowed into the admin, checked on top of the Access policy. */
  ADMIN_EMAILS?: string;
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
  /** One of CATEGORIES, or a category the admin typed in. */
  category: string;
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
  category: string;
  tags: string;
  added: string;
  repo_private: number;
  /** 1 = private: hidden from the public site, shown only in the admin. */
  hidden: number;
  source: 'seed' | 'sync' | 'manual';
  /** JSON array of columns the admin edited; the sync never writes these. */
  manual_fields: string;
  origin_github_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncReport = {
  added: { repo: string; name: string; websiteUrl: string; category: string; via: string }[];
  updated: { repo: string; change: string }[];
  skipped: { repo: string; reason: string }[];
  errors: string[];
  warnings: string[];
};
