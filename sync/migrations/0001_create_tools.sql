-- One row per directory entry. A repository can back more than one entry
-- (outlook-junk-cleaner powers both Junk Desk and Outlook Junk Selector),
-- so github_url is indexed but not unique.
CREATE TABLE tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  github_url TEXT NOT NULL,
  website_url TEXT,
  category TEXT NOT NULL,
  -- JSON array of strings.
  tags TEXT NOT NULL DEFAULT '[]',
  -- Date the tool was added to the directory (YYYY-MM-DD).
  added TEXT NOT NULL,
  -- Private repositories are listed without a GitHub link.
  repo_private INTEGER NOT NULL DEFAULT 0,
  -- Hidden rows stay in the table so the nightly sync does not re-add them.
  hidden INTEGER NOT NULL DEFAULT 0,
  -- 'seed' (migrated from tools.ts), 'sync' (added by the cron) or 'manual'.
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX tools_github_url ON tools (lower(github_url));

-- One row per sync run, so skipped repositories and their reasons can be inspected.
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  -- JSON: { added: [...], skipped: [{ repo, reason }], errors: [...] }
  report TEXT
);
