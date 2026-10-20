import type { Env } from './types.ts';

/**
 * Per-run context. `fetch` counts outbound requests so a run stays under the
 * Workers subrequest limit (50 on the Free plan); repos that do not fit are
 * retried on the next run.
 */
export type Ctx = { env: Env; fetch: typeof fetch; remaining: () => number };

export class BudgetExceeded extends Error {
  constructor() {
    super('subrequest budget used up for this run');
  }
}

export function createCtx(env: Env): Ctx {
  let left = Number(env.MAX_SUBREQUESTS) || 45;
  const counted: typeof fetch = (input, init) => {
    if (left <= 0) throw new BudgetExceeded();
    left--;
    return fetch(input, init);
  };
  return { env, fetch: counted, remaining: () => left };
}
