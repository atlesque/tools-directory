import { CATEGORIES, type Category, type Env } from './types.ts';

export type Listing = { name: string; description: string; category: Category; tags: string[] };

export type ListingInput = {
  repo: string;
  repoDescription: string;
  topics: string[];
  url: string;
  pageTitle: string;
  pageDescription: string;
  readme: string;
};

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string', enum: [...CATEGORIES] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'description', 'category', 'tags'],
};

const SYSTEM = `You write entries for a directory of small web tools built by one developer.
Return JSON with:
- name: the tool's display name in Title Case, at most 40 characters. Prefer the name the site or README uses; otherwise prettify the repo name.
- description: one plain sentence, at most 140 characters, saying what the tool does. Start with a noun phrase, no marketing words, no "This tool".
- category: exactly one of ${CATEGORIES.join(', ')}.
- tags: 3 to 7 lowercase search keywords.

Examples:
{"name":"Text Differ","description":"Side-by-side text comparison and diff visualizer.","category":"Text","tags":["diff","compare","text","side by side"]}
{"name":"Polaroid Generator","description":"Offline browser tool that adds a Polaroid frame around an image.","category":"Images","tags":["polaroid","frame","image","photo","offline"]}
{"name":"Scrum Poker","description":"Real-time planning poker app for agile teams.","category":"Productivity","tags":["scrum","poker","planning","agile","estimation"]}`;

/** Asks Workers AI for a directory entry and validates the result. */
export async function describe(env: Env, input: ListingInput): Promise<Listing> {
  const user = [
    `Repository: ${input.repo}`,
    `Repository description: ${input.repoDescription || '(none)'}`,
    `Topics: ${input.topics.join(', ') || '(none)'}`,
    `Website: ${input.url}`,
    `Page title: ${input.pageTitle || '(none)'}`,
    `Page description: ${input.pageDescription || '(none)'}`,
    `README excerpt:\n${input.readme || '(none)'}`,
  ].join('\n');

  const result = (await env.AI.run(env.AI_MODEL as keyof AiModels, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    max_tokens: 400,
    temperature: 0.2,
  } as never)) as { response?: unknown };

  const raw = typeof result.response === 'string' ? JSON.parse(result.response) : result.response;
  return validate(raw);
}

function validate(raw: unknown): Listing {
  const value = raw as Partial<Record<keyof Listing, unknown>> | null;
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const description = typeof value?.description === 'string' ? value.description.trim() : '';
  const category = CATEGORIES.find((c) => c.toLowerCase() === String(value?.category ?? '').toLowerCase());
  const tags = Array.isArray(value?.tags)
    ? [...new Set(value.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 7)
    : [];
  if (!name || !description || !category) throw new Error(`AI returned an incomplete entry: ${JSON.stringify(raw)}`);
  return { name: name.slice(0, 60), description: description.slice(0, 200), category, tags };
}
