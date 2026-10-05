import type { AccountSeed, FeeChange, SubscriptionValue, ValueAccount, ValueTotals } from '../services/subscriptionValue';

/** Fictional browser-only analytics; never accesses account tokens or the real database. */
export function createSubscriptionValueMock(empty: boolean) {
  const fees = new Map<string, Map<string, number | null>>();
  let roster: AccountSeed[] = [];
  const totals = (cost: number, requests: number, priced = requests): ValueTotals => ({
    estimatedCost: cost, requests, pricedRequests: priced, inputTokens: requests * 1400,
    outputTokens: requests * 900, cacheReadTokens: requests * 800, cacheCreationTokens: 0,
  });
  return {
    get(month: string, seeds: AccountSeed[] | null): SubscriptionValue {
      if (seeds) roster = seeds;
      const seen: Record<string, number> = {};
      const accounts: ValueAccount[] = (empty ? [] : roster).map(seed => {
        const order = seen[seed.provider] ?? 0; seen[seed.provider] = order + 1;
        const id = `${seed.provider}:${seed.authIndex || seed.name}`;
        const models: Record<string, ValueTotals> = seed.provider === 'claude' && order === 0 ? { 'claude-opus-demo': totals(654.2, 480), 'claude-sonnet-demo': totals(258.6, 620) }
          : seed.provider === 'claude' && order === 1 ? { 'claude-sonnet-demo': totals(84.6, 105) }
          : seed.provider === 'codex' && order === 0 ? { 'gpt-codex-demo': totals(327.9, 750) }
          : seed.provider === 'antigravity' && order === 0 ? { 'gemini-pro-demo': totals(92.4, 230), 'claude-sonnet-demo': totals(68.7, 235), 'unknown-demo': totals(0, 50, 0) } : {};
        const cost = Object.values(models).reduce((sum, value) => sum + value.estimatedCost, 0);
        const requests = Object.values(models).reduce((sum, value) => sum + value.requests, 0);
        const pricedRequests = Object.values(models).reduce((sum, value) => sum + value.pricedRequests, 0);
        const history = [...(fees.get(id)?.entries() ?? [])].filter(([m]) => m <= month).sort(([a], [b]) => b.localeCompare(a));
        return { id, provider: seed.provider, label: seed.label, current: true, monthlyFeeCents: history[0]?.[1] ?? null,
          requests, pricedRequests, estimatedCost: cost, models,
          days: { [`${month}-01`]: totals(cost * .4, Math.floor(requests * .4), Math.floor(pricedRequests * .4)), [`${month}-02`]: totals(cost * .6, requests - Math.floor(requests * .4), pricedRequests - Math.floor(pricedRequests * .4)) } };
      });
      return { month, accounts, otherRequests: empty ? 0 : 27 };
    },
    save(month: string, changes: FeeChange[]) {
      for (const change of changes) {
        const history = fees.get(change.accountId) ?? new Map<string, number | null>();
        history.set(month, change.monthlyFeeCents); fees.set(change.accountId, history);
      }
    },
  };
}
