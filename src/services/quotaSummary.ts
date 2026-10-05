import { fileName, type AuthFile, type QuotaState } from './quotaService';
import { readString } from './managementApi';

export type QuotaAccount = { file: AuthFile; quota: QuotaState };
export type QuotaSort = 'name' | 'remaining' | 'reset';

export function filterAndSortQuotaAccounts(items: QuotaAccount[], search: string, sort: QuotaSort, locale = 'en'): QuotaAccount[] {
  const query = search.trim().toLocaleLowerCase(locale);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const valueFor = ({ quota }: QuotaAccount) => {
    if (quota.status !== 'success') return Infinity;
    const values = quota.rows.flatMap((row) => {
      const value = sort === 'remaining' ? row.remainingPercent
        : row.resetAtMs === undefined ? undefined : row.resetAtMs - (quota.serverTimeOffsetMs ?? 0);
      return typeof value === 'number' && Number.isFinite(value) ? [value] : [];
    });
    return values.length ? Math.min(...values) : Infinity;
  };
  return items.filter(({ file, quota }) =>
    [fileName(file), readString(file, 'email'), quota.plan ?? ''].some((value) => value.toLocaleLowerCase(locale).includes(query)),
  ).sort((a, b) => {
    if (sort !== 'name') {
      const left = valueFor(a);
      const right = valueFor(b);
      if (left !== right) return left < right ? -1 : 1;
    }
    return collator.compare(fileName(a.file), fileName(b.file));
  });
}

export type QuotaSummary = {
  label: string;
  totalRemaining: number;
  reported: number;
  capacity: number;
  segments: (number | null)[];
  earliestResetAtMs?: number;
};

// Compare the same window across accounts. Unknown quotas never count as empty
// or full, and percentages describe account equivalents, not pooled tokens.
export function summarizeQuotas(quotas: QuotaState[]): QuotaSummary[] {
  const labels = new Set(quotas.flatMap((quota) =>
    quota.status === 'success' ? quota.rows.map((row) => row.label) : []));
  return [...labels].map((label) => {
    const resets: number[] = [];
    const segments = quotas.map((quota) => {
      if (quota.status !== 'success') return null;
      const row = quota.rows.find((candidate) => candidate.label === label);
      if (!row || row.remainingPercent === null || !Number.isFinite(row.remainingPercent)) return null;
      if (row.resetAtMs !== undefined && Number.isFinite(row.resetAtMs)) {
        resets.push(row.resetAtMs - (quota.serverTimeOffsetMs ?? 0));
      }
      return Math.max(0, Math.min(100, row.remainingPercent));
    });
    const reported = segments.filter((value) => value !== null).length;
    return {
      label,
      segments,
      reported,
      capacity: reported * 100,
      totalRemaining: segments.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      earliestResetAtMs: resets.length ? Math.min(...resets) : undefined,
    };
  });
}

export const quotaTone = (percent: number | null) =>
  percent === null ? 'unknown' : percent <= 20 ? 'low' : percent <= 60 ? 'medium' : 'healthy';
