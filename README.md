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
3. Keeps only sites on a subdomain of `TOOL_DOMAINS` (`*.atlesque.dev`), since sites on other domains are
   usually client or personal websites. A repo with the `directory` topic is added from any domain, and one with
   the `no-directory` topic is never added. `IGNORE_HOSTS` lists hostnames that are never a tool's site.
4. Drops sites behind Cloudflare Access (checked against Access applications and by loading the front page
   anonymously) and sites that do not respond.
5. Asks Workers AI for a name, description, category and tags, and inserts the tool.
6. Updates `repo_private` for existing tools; private repos are listed without a GitHub link. This is the only
   column the sync writes on existing rows, and it skips rows where the admin set it by hand (see below).
7. Calls the Pages deploy hook, so the static site picks up the changes.

Cron Triggers run in UTC, so `wrangler.toml` schedules 01:00 and 02:00 UTC and the handler only continues on
the one that is 03:00 in Amsterdam (CEST in summer, CET in winter).

`GET /api/tools` only serves public tools with a website; private tools and older entries without a website stay
in the database.

To remove a tool for good, make it private (`hidden = 1`) instead of deleting the row, otherwise the next sync adds
it again.

### Setup

```bash
cd sync
npm install
npx wrangler d1 migrations apply tools-directory --remote   # already applied to the live database
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put PAGES_DEPLOY_HOOK
npx wrangler secret put SYNC_TOKEN        # optional, enables manual runs
npx wrangler secret put ACCESS_TEAM_DOMAIN   # admin, see "Admin setup"
npx wrangler secret put ACCESS_AUD
npx wrangler deploy
```

- `GITHUB_TOKEN`: fine-grained token for `atlesque` with access to all repositories, permissions
  Metadata (read) and Contents (read).
- `CLOUDFLARE_API_TOKEN`: user API token with Account › Cloudflare Pages: Read, Account › Workers Scripts: Read,
  Account › Access: Apps and Policies: Read, Account › Workers Builds Configuration: Read, and for all zones
  Zone › Zone: Read and Zone › Workers Routes: Read.
- `PAGES_DEPLOY_HOOK`: Pages project › Settings › Builds › Deploy hooks, for the production branch.
- `MAX_SUBREQUESTS` (var): outbound requests per run, 900 for Workers Paid (use 45 on the Free plan). Repos that do
  not fit are picked up on later nights, starting from a different repo each day.

### Manual runs

```bash
# Dry run: reports what would be added without writing or rebuilding
curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" "https://tools-directory-sync.alexander-df0.workers.dev/api/sync?dry=1"
# Recent runs with skipped repos and reasons
curl -H "Authorization: Bearer $SYNC_TOKEN" https://tools-directory-sync.alexander-df0.workers.dev/api/runs
```

`npm test` runs the unit tests for the matching helpers, admin edits and the Access token check.

For `wrangler dev`, put `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `sync/.dev.vars`; the admin needs a valid Access
token locally too.

## Admin (`/admin` on the sync Worker)

https://tools-admin.atlesque.dev/admin lists every tool, including private ones and ones without a website. From
there you can add tools, edit the name, description, category (pick one or type a new one), tags, links and date,
and make a tool private (hidden from the public site) or public again. Changes go live on the next nightly rebuild,
or straight away with **Publish site now**, which calls the Pages deploy hook.

Manual edits stick: every column the admin changes is recorded in the row's `manual_fields`, and the sync never
writes a column listed there. A tool's original GitHub URL is kept in `origin_github_url`, so pointing a tool at
another repo does not make the sync add the old repo again. Tools are never deleted from the admin; making one
private is the way to remove it.

Access is enforced twice: a Cloudflare Access application in front of `tools-admin.atlesque.dev`, and a check of
the Access token in the Worker (`src/access.ts`) for the application's AUD tag and the emails in `ADMIN_EMAILS`.
That second check keeps `/admin` closed on the workers.dev URL, which Access does not cover. Until
`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, `/admin` answers 503.

### Admin setup

1. Zero Trust › Access › Applications › Add an application › Self-hosted. Domain `tools-admin.atlesque.dev`
   (no path), one Allow policy with the rule Emails = `alexander@atlesque.media`. Copy the Application Audience
   (AUD) tag from the application's overview.
2. Note the team domain from Zero Trust › Settings › Custom Pages (`https://<team>.cloudflareaccess.com`).
3. Then:

```bash
cd sync
npm run migrate                              # applies 0003_admin_edits.sql
npx wrangler secret put ACCESS_TEAM_DOMAIN   # https://<team>.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD
npx wrangler deploy                          # also creates the tools-admin.atlesque.dev custom domain
```
