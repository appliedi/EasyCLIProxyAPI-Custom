import { dedupeAuthFiles, isOAuthCredentialFile, authFileCooldownResetIndex, normalizeOAuthProvider } from './authFiles';
import { isRecord, readString, responseList } from './managementApi';

export type ValueTotals = {
  requests: number; pricedRequests: number; estimatedCost: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
};
export type ValueAccount = {
  id: string; provider: string; label: string; current: boolean; monthlyFeeCents: number | null;
  requests: number; pricedRequests: number; estimatedCost: number;
  models: Record<string, ValueTotals>; days: Record<string, ValueTotals>;
};
export type SubscriptionValue = { month: string; accounts: ValueAccount[]; otherRequests: number };
export type AccountSeed = { provider: string; authIndex: string; name: string; label: string };
export type FeeChange = { accountId: string; monthlyFeeCents: number | null };

export function subscriptionSeeds(payload: unknown): AccountSeed[] {
  if (!Array.isArray(payload) && !(isRecord(payload) && Array.isArray(payload.files))) throw new Error('Invalid credentials response');
  return dedupeAuthFiles(responseList(payload, 'files')).filter(isOAuthCredentialFile).map(file => ({
    provider: normalizeOAuthProvider(readString(file, 'provider', 'type')),
    authIndex: authFileCooldownResetIndex(file) ?? '',
    name: readString(file, 'name'),
    label: readString(file, 'email') || readString(file, 'name'),
  })).filter(seed => seed.provider && seed.name);
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function validMonth(month: string): boolean {
  return /^(19[7-9]\d|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(month);
}

export function parseFeeCents(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Invalid fee');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) throw new Error('Invalid fee');
  return cents;
}

export function summarizeValue(accounts: ValueAccount[]) {
  const withFees = accounts.filter(a => a.monthlyFeeCents !== null);
  const fees = withFees.reduce((sum, a) => sum + a.monthlyFeeCents!, 0) / 100;
  const comparableCost = withFees.reduce((sum, a) => sum + a.estimatedCost, 0);
  return {
    cost: accounts.reduce((sum, a) => sum + a.estimatedCost, 0),
    requests: accounts.reduce((sum, a) => sum + a.requests, 0),
    pricedRequests: accounts.reduce((sum, a) => sum + a.pricedRequests, 0),
    fees, feeAccounts: withFees.length,
    ratio: fees > 0 ? comparableCost / fees : null,
  };
}

export function combineModels(accounts: ValueAccount[]) {
  const combined = new Map<string, ValueTotals & { model: string; accounts: number }>();
  for (const account of accounts) for (const [model, totals] of Object.entries(account.models)) {
    const row = combined.get(model) ?? { model, accounts: 0, requests: 0, pricedRequests: 0, estimatedCost: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    row.accounts++;
    for (const key of ['requests', 'pricedRequests', 'estimatedCost', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens'] as const) row[key] += totals[key];
    combined.set(model, row);
  }
  return [...combined.values()].sort((a, b) => b.estimatedCost - a.estimatedCost || a.model.localeCompare(b.model));
}

export function valueTimeline(accounts: ValueAccount[], month: string, now = new Date()) {
  if (!validMonth(month)) return [];
  const [year, m] = month.split('-').map(Number);
  const lastDay = month === currentMonth(now) ? now.getDate() : new Date(year, m, 0).getDate();
  let cost = 0;
  return Array.from({ length: lastDay }, (_, index) => {
    const day = `${month}-${String(index + 1).padStart(2, '0')}`;
    cost += accounts.reduce((sum, a) => sum + (a.days[day]?.estimatedCost ?? 0), 0);
    return { day: index + 1, cost };
  });
}
