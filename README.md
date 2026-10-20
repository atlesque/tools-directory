# Tools Directory

An Astro directory of tools built by `atlesque`, served from Cloudflare Pages at https://tools.atlesque.dev.

The tool list lives in a Cloudflare D1 database (`tools-directory`). The site is still fully static: every
build reads the list once from the sync Worker, so visitors never hit a Worker or the database. A nightly
Cron Trigger adds new tools and rebuilds the site.

```
GitHub repos ─┐
Cloudflare API ├─> sync Worker (03:00 Amsterdam) ──> D1 ──> GET /api/tools ──> Pages build ──> static site
Workers AI ────┘                         └── Pages deploy hook ──┘
```

## Site

```bash
npm install
npm run dev          # uses src/data/tools.fixture.json when TOOLS_API_URL is unset
TOOLS_API_URL=https://tools-directory-sync.alexander-df0.workers.dev/api/tools npm run build
```

Production builds need `TOOLS_API_URL`, which `wrangler.toml` sets for Pages.

## Nightly sync (`sync/`)

Each night at 03:00 Europe/Amsterdam the Worker:

1. Lists every repository the GitHub token can see (public and private, skipping forks and archived repos).
2. Takes the ones not yet in the directory and looks for a deployment on a custom domain: the repo's GitHub
   homepage, a Pages project or Workers Build linked to the repo, or a Pages project / Worker with the same name.
3. Drops sites behind Cloudflare Access (checked against Access applications and by loading the front page
   anonymously) and sites that do not respond.
4. Asks Workers AI for a name, description, category and tags, and inserts the tool.
5. Updates `repo_private` for existing tools; private repos are listed without a GitHub link.
6. Calls the Pages deploy hook, so the static site picks up the changes.

Cron Triggers run in UTC, so `wrangler.toml` schedules 01:00 and 02:00 UTC and the handler only continues on
the one that is 03:00 in Amsterdam (CEST in summer, CET in winter).

To remove a tool for good, set `hidden = 1` instead of deleting the row, otherwise the next sync adds it again.

### Setup

```bash
cd sync
npm install
npx wrangler d1 migrations apply tools-directory --remote   # already applied to the live database
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put PAGES_DEPLOY_HOOK
npx wrangler secret put SYNC_TOKEN        # optional, enables manual runs
npx wrangler deploy
```

- `GITHUB_TOKEN`: fine-grained token for `atlesque` with access to all repositories, permissions
  Metadata (read) and Contents (read).
- `CLOUDFLARE_API_TOKEN`: user API token with Account › Cloudflare Pages: Read, Account › Workers Scripts: Read,
  Account › Access: Apps and Policies: Read, Account › Workers Builds Configuration: Read, and for all zones
  Zone › Zone: Read and Zone › Workers Routes: Read.
- `PAGES_DEPLOY_HOOK`: Pages project › Settings › Builds › Deploy hooks, for the production branch.
- `MAX_SUBREQUESTS` (var): outbound requests per run. 45 fits the Free plan limit of 50; repos that do not fit
  are picked up the next night. Raise it on Workers Paid.

### Manual runs

```bash
# Dry run: reports what would be added without writing or rebuilding
curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" "https://tools-directory-sync.alexander-df0.workers.dev/api/sync?dry=1"
# Recent runs with skipped repos and reasons
curl -H "Authorization: Bearer $SYNC_TOKEN" https://tools-directory-sync.alexander-df0.workers.dev/api/runs
```

`npm test` runs the unit tests for the matching helpers.
