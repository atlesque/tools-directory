// Pure helpers for admin edits, kept free of Workers APIs so they run under `node --test`.
import { repoKey } from './match.ts';
import type { ToolRow } from './types.ts';

/** Fields the admin can set, as sent by the admin page. */
export type ToolInput = {
  name: string;
  description: string;
  githubUrl: string;
  websiteUrl: string;
  category: string;
  tags: string[];
  added: string;
  private: boolean;
  repoPrivate: boolean;
};

/** Database column behind each admin field. `private` is the existing `hidden` flag. */
export const COLUMNS = {
  name: 'name',
  description: 'description',
  githubUrl: 'github_url',
  websiteUrl: 'website_url',
  category: 'category',
  tags: 'tags',
  added: 'added',
  private: 'hidden',
  repoPrivate: 'repo_private',
} as const satisfies Record<keyof ToolInput, keyof ToolRow>;

export type Column = (typeof COLUMNS)[keyof ToolInput];
type Field = keyof ToolInput;

const text = (value: unknown, field: string, max: number, required: boolean): string => {
  if (typeof value !== 'string') throw new InputError(`${field} must be text`);
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (required && !trimmed) throw new InputError(`${field} is required`);
  if (trimmed.length > max) throw new InputError(`${field} is longer than ${max} characters`);
  return trimmed;
};

export class InputError extends Error {}

const PARSERS: { [F in Field]: (value: unknown) => ToolInput[F] } = {
  name: (value) => text(value, 'Name', 60, true),
  description: (value) => text(value, 'Description', 300, true),
  category: (value) => text(value, 'Category', 40, true),
  githubUrl: (value) => {
    const url = text(value, 'GitHub URL', 300, false);
    if (!url) return '';
    const key = repoKey(url);
    if (!key) throw new InputError('GitHub URL must look like https://github.com/owner/repo');
    return `https://github.com/${key}`;
  },
  websiteUrl: (value) => {
    const url = text(value, 'Website', 300, false);
    if (!url) return '';
    try {
      const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (!parsed.hostname.includes('.')) throw new Error();
      return parsed.href;
    } catch {
      throw new InputError('Website must be a URL such as https://tool.atlesque.dev/');
    }
  },
  tags: (value) => {
    const list = typeof value === 'string' ? value.split(',') : value;
    if (!Array.isArray(list) || list.some((tag) => typeof tag !== 'string')) throw new InputError('Tags must be a list of words');
    const tags = [...new Set((list as string[]).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
    if (tags.length > 12) throw new InputError('Use at most 12 tags');
    return tags.map((tag) => tag.slice(0, 40));
  },
  added: (value) => {
    const date = text(value, 'Date added', 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new InputError('Date added must be YYYY-MM-DD');
    return date;
  },
  private: (value) => {
    if (typeof value !== 'boolean') throw new InputError('private must be true or false');
    return value;
  },
  repoPrivate: (value) => {
    if (typeof value !== 'boolean') throw new InputError('repoPrivate must be true or false');
    return value;
  },
};

/**
 * Validates a create (every text field required) or an update (any subset of
 * fields). Unknown keys are ignored. Throws InputError with a readable message.
 */
export function parseToolInput(body: unknown, mode: 'create' | 'update'): Partial<ToolInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Expected a JSON object');
  const source = body as Record<string, unknown>;
  const result: Partial<Record<Field, unknown>> = {};
  for (const field of Object.keys(PARSERS) as Field[]) {
    if (source[field] === undefined) continue;
    result[field] = PARSERS[field](source[field]);
  }
  if (mode === 'create') {
    const required = { name: 'Name', description: 'Description', category: 'Category' } as const;
    for (const [field, label] of Object.entries(required)) {
      if (result[field as Field] === undefined) throw new InputError(`${label} is required`);
    }
  } else if (!Object.keys(result).length) {
    throw new InputError('Nothing to update');
  }
  return result as Partial<ToolInput>;
}

/** The value a field is stored as in D1. */
export function toColumn<F extends Field>(field: F, value: ToolInput[F]): string | number | null {
  if (field === 'tags') return JSON.stringify(value);
  if (field === 'private' || field === 'repoPrivate') return value ? 1 : 0;
  if (field === 'websiteUrl') return (value as string) || null;
  return value as string;
}

export const manualFields = (row: Pick<ToolRow, 'manual_fields'>): string[] => {
  try {
    const parsed = JSON.parse(row.manual_fields ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

/**
 * Column updates for an edit, plus the row's new manual_fields: every column
 * whose value actually changes is recorded so the nightly sync leaves it alone.
 */
export function planUpdate(row: ToolRow, input: Partial<ToolInput>): { set: [Column, string | number | null][]; manual: string[] } {
  const set: [Column, string | number | null][] = [];
  const manual = new Set(manualFields(row));
  for (const field of Object.keys(input) as Field[]) {
    const column = COLUMNS[field];
    const next = toColumn(field, input[field] as never);
    if ((row[column] ?? null) === next) continue;
    set.push([column, next]);
    manual.add(column);
  }
  return { set, manual: [...manual] };
}

/** Whether the nightly sync may overwrite `column` on this row. */
export const syncMayWrite = (row: Pick<ToolRow, 'manual_fields'>, column: Column) => !manualFields(row).includes(column);
