import { expect, test } from 'bun:test';
import { combineModels, currentMonth, parseFeeCents, subscriptionSeeds, summarizeValue, valueTimeline, type ValueAccount, type ValueTotals } from '../src/services/subscriptionValue';
import { canOpenAppPage } from '../src/navigation';

const totals = (cost: number): ValueTotals => ({ estimatedCost: cost, requests: 4, pricedRequests: 3, inputTokens: 100, outputTokens: 20, cacheReadTokens: 40, cacheCreationTokens: 5 });
const account = (id: string, fee: number | null, cost: number): ValueAccount => ({ id, label: id, provider: 'claude', current: true, monthlyFeeCents: fee, estimatedCost: cost, requests: 4, pricedRequests: 3, models: { sonnet: totals(cost) }, days: { '2026-09-02': totals(cost) } });

test('value comparison excludes accounts without fees from its numerator and denominator', () => {
  expect(summarizeValue([account('a', 10000, 200), account('b', null, 900)])).toMatchObject({ cost: 1100, fees: 100, ratio: 2, feeAccounts: 1, requests: 8, pricedRequests: 6 });
  expect(summarizeValue([account('a', 0, 200)]).ratio).toBeNull();
  expect(summarizeValue([]).ratio).toBeNull();
});

test('fees preserve unknown versus explicit zero and reject invalid financial inputs', () => {
  expect(parseFeeCents('')).toBeNull(); expect(parseFeeCents('0')).toBe(0); expect(parseFeeCents('19.99')).toBe(1999);
  for (const value of ['-1', '1.234', '1e3', 'Infinity', 'NaN', '1000001', 'abc']) expect(() => parseFeeCents(value)).toThrow();
});

test('model and daily totals reconcile across accounts without duplicating cached tokens', () => {
  const accounts = [account('a', 2000, 20), account('b', 10000, 50)];
  expect(combineModels(accounts)[0]).toMatchObject({ model: 'sonnet', accounts: 2, estimatedCost: 70, requests: 8, cacheReadTokens: 80 });
  const points = valueTimeline(accounts, '2026-09', new Date(2026, 9, 5));
  expect(points).toHaveLength(30); expect(points[0].cost).toBe(0); expect(points[1].cost).toBe(70); expect(points.at(-1)?.cost).toBe(70);
  expect(valueTimeline([], '2026-02', new Date(2026, 2, 1))).toHaveLength(28);
  expect(valueTimeline([], '2024-02', new Date(2026, 2, 1))).toHaveLength(29);
  expect(valueTimeline([], '2026-10', new Date(2026, 9, 5))).toHaveLength(5);
});

test('roster includes idle and disabled OAuth accounts but excludes API/runtime credentials', () => {
  const files = [{ name: 'one.json', provider: 'anthropic', auth_index: 'a', disabled: true }, { name: 'two.json', provider: 'antigravity', auth_index: 'b' }, { name: 'key.json', provider: 'claude', account_type: 'api_key' }, { name: 'runtime.json', provider: 'codex', runtime_only: true }];
  expect(subscriptionSeeds({ files }).map(s => s.provider)).toEqual(['claude', 'antigravity']);
  expect(() => subscriptionSeeds({ error: 'unavailable' })).toThrow();
  expect(subscriptionSeeds({ files: [] })).toEqual([]);
  expect(currentMonth(new Date(2026, 0, 1))).toBe('2026-01');
  expect(canOpenAppPage('subscription-value', false)).toBe(true);
});
