import { describe, expect, it } from 'bun:test';
import { filterAndSortQuotaAccounts, summarizeQuotas, type QuotaAccount } from '../src/services/quotaSummary';
import type { QuotaState } from '../src/services/quotaService';

const success = (percent: number | null, label = 'Weekly', resetAtMs?: number): QuotaState => ({
  status: 'success', rows: [{ label, remainingPercent: percent, resetAtMs }],
});

describe('quota account filtering and sorting', () => {
  const accounts: QuotaAccount[] = [
    { file: { name: 'account10.json' }, quota: success(80, 'Weekly', 9000) },
    { file: { name: 'account2.json', email: 'team@example.com' }, quota: { ...success(90, 'Weekly', 12000), plan: 'Pro', rows: [{ label: 'Weekly', remainingPercent: 90, resetAtMs: 12000 }, { label: '5-hour', remainingPercent: 5, resetAtMs: 7000 }] } },
    { file: { name: 'account1.json' }, quota: { status: 'error', rows: [] } },
    { file: { name: 'account3.json' }, quota: { ...success(null, 'Weekly', 10000), serverTimeOffsetMs: 5000 } },
  ];

  it('searches names, email and plans case-insensitively without mutating the source', () => {
    expect(filterAndSortQuotaAccounts(accounts, ' TEAM@EXAMPLE ', 'name').map(({ file }) => file.name)).toEqual(['account2.json']);
    expect(filterAndSortQuotaAccounts(accounts, 'pro', 'name')).toHaveLength(1);
    expect(filterAndSortQuotaAccounts(accounts, 'account', 'name').map(({ file }) => file.name)).toEqual(['account1.json', 'account2.json', 'account3.json', 'account10.json']);
    expect(filterAndSortQuotaAccounts(accounts, 'missing', 'name')).toEqual([]);
    expect(accounts[0].file.name).toBe('account10.json');
  });

  it('sorts by the lowest known remaining window with unavailable accounts last', () => {
    expect(filterAndSortQuotaAccounts(accounts, '', 'remaining').map(({ file }) => file.name)).toEqual(['account2.json', 'account10.json', 'account1.json', 'account3.json']);
  });

  it('sorts resets with server clock offsets and puts unknown reset times last', () => {
    expect(filterAndSortQuotaAccounts(accounts, '', 'reset').map(({ file }) => file.name)).toEqual(['account3.json', 'account2.json', 'account10.json', 'account1.json']);
  });
});

describe('provider quota summaries', () => {
  it('adds matching windows while excluding missing and failed quotas from the denominator', () => {
    const [summary] = summarizeQuotas([
      success(58), success(100), success(0), success(null),
      { status: 'error', rows: [], error: 'offline' }, { status: 'idle', rows: [] },
      { status: 'loading', rows: [{ label: 'Weekly', remainingPercent: 90 }] },
    ]);
    expect(summary.totalRemaining).toBe(158);
    expect(summary.capacity).toBe(300);
    expect(summary.reported).toBe(3);
    expect(summary.segments).toEqual([58, 100, 0, null, null, null, null]);
  });

  it('never combines different windows or fabricates unknown percentages', () => {
    const summaries = summarizeQuotas([success(70), success(20, '5-hour'), success(null, 'Paid API')]);
    expect(summaries.map(({ label, totalRemaining, capacity }) => ({ label, totalRemaining, capacity }))).toEqual([
      { label: 'Weekly', totalRemaining: 70, capacity: 100 },
      { label: '5-hour', totalRemaining: 20, capacity: 100 },
      { label: 'Paid API', totalRemaining: 0, capacity: 0 },
    ]);
  });

  it('keeps overdue reset timestamps, accounts for clock offset, and excludes unknown accounts', () => {
    const [summary] = summarizeQuotas([
      success(25, 'Weekly', 9000),
      { ...success(0, 'Weekly', 8000), serverTimeOffsetMs: 2000 },
      success(null, 'Weekly', 1000),
    ]);
    expect(summary.earliestResetAtMs).toBe(6000);
    expect(summary.totalRemaining).toBe(25);
  });

  it('guards against invalid numbers and clamps out-of-range percentages', () => {
    const [summary] = summarizeQuotas([success(NaN), success(Infinity), success(-5), success(120)]);
    expect(summary.segments).toEqual([null, null, 0, 100]);
    expect(summary.totalRemaining).toBe(100);
    expect(summary.capacity).toBe(200);
    expect(summarizeQuotas([])).toEqual([]);
  });
});
