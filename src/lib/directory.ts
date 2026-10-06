import { tools, type Tool } from '../data/tools';

const palette = ['#8b5cf6', '#22b8cf', '#3b82f6', '#f97316', '#ec4899', '#14b8a6', '#eab308', '#a3e635', '#94a3b8'];

export const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const categories = [...new Set(tools.map((tool) => tool.category))].sort();

export const categoryColor: Record<string, string> = Object.fromEntries(
  categories.map((category, index) => [category, palette[index % palette.length]]),
);

export const countIn = (category: string) => tools.filter((tool) => tool.category === category).length;

export const deployedCount = tools.filter((tool) => tool.websiteUrl).length;
export const repoOnlyCount = tools.length - deployedCount;

/** Newest first; ties keep their order in tools.ts. */
export const toolsByDate: Tool[] = tools
  .map((tool, index) => ({ tool, index }))
  .sort((a, b) => b.tool.added.localeCompare(a.tool.added) || a.index - b.index)
  .map(({ tool }) => tool);

export const recentTools = toolsByDate.slice(0, 6);

export const formatDate = (iso: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
