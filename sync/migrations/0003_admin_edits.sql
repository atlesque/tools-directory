-- Columns the admin interface (src/admin.ts) changed by hand, as a JSON array of
-- column names. The nightly sync never writes a column listed here.
ALTER TABLE tools ADD COLUMN manual_fields TEXT NOT NULL DEFAULT '[]';

-- GitHub URL the row was created with. The sync treats this repo as listed even
-- after the admin points github_url elsewhere, so it does not add it a second time.
ALTER TABLE tools ADD COLUMN origin_github_url TEXT;
UPDATE tools SET origin_github_url = github_url;
