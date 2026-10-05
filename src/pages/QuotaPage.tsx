import { ResetCreditExpiries } from '../components/ResetCreditExpiries';
import { MessageNotice } from '../appNotice';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react';
import { useConfirmation } from '../components/ConfirmationDialog';
import { QuotaActionFeedback } from '../components/QuotaActionFeedback';
import { canResetQuota, hasPendingClaudeReset } from '../services/quotaActions';
import { useQuotaReset } from '../components/useQuotaReset';
import antigravityIcon from '../assets/icons/antigravity.svg';
import claudeIcon from '../assets/icons/claude.svg';
import codexIcon from '../assets/icons/codex.svg';
import grokIcon from '../assets/icons/grok.svg';
import devinIcon from '../assets/icons/devin.svg';
import kimiIcon from '../assets/icons/kimi-light.svg';
import { managementApi, readBoolean, responseList } from '../services/managementApi';
import { formatQuotaReset, useQuotaClock } from '../services/quotaTime';
import {
  fileName,
  formatQuotaTimestamp,
  idleQuota,
  loadQuota,
  providerForFile,
  quotaKey,
  type AuthFile,
  type QuotaProvider,
  type QuotaState,
} from '../services/quotaService';
import {
  captureQuotaCacheGeneration,
  commitQuotaCacheIfCurrent,
  getQuotaCacheSnapshot,
  pruneQuotaCache,
  updateQuotaCache,
  useQuotaCache,
} from '../services/quotaCache';
import { dedupeAuthFiles, isOAuthCredentialFile, parseAuthFilePriority, sortAuthFilesByPriority } from '../services/authFiles';
import { AuthFileSettingsDialog } from '../components/AuthFileSettingsDialog';
import { AccountRoutingPanel } from '../components/AccountRoutingPanel';
import { useI18n } from '../i18n';
import { filterAndSortQuotaAccounts, quotaTone, summarizeQuotas, type QuotaSort } from '../services/quotaSummary';
import './QuotaPage.css';

const providerMeta: Record<QuotaProvider, { label: string; icon: string }> = {
  claude: { label: 'Claude', icon: claudeIcon },
  codex: { label: 'Codex', icon: codexIcon },
  kimi: { label: 'Kimi', icon: kimiIcon },
  xai: { label: 'xAI', icon: grokIcon },
  devin: { label: 'Devin', icon: devinIcon },
  antigravity: { label: 'Antigravity', icon: antigravityIcon },
};

const providerOrder: QuotaProvider[] = ['claude', 'antigravity', 'codex', 'xai', 'kimi', 'devin'];
const REFRESH_CONCURRENCY = 4;

export function QuotaPage() {
  const { locale, t } = useI18n();
  const { askConfirmation, confirmationDialog } = useConfirmation();
  const [files, setFiles] = useState<AuthFile[]>([]);
  const quotas = useQuotaCache();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [providerFilter, setProviderFilter] = useState<QuotaProvider | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<QuotaSort>('name');
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [layout, setLayout] = useState<'ledger' | 'cards'>(() => {
    try { return localStorage.getItem('easy-cli-proxy-api.quota-layout') === 'cards' ? 'cards' : 'ledger'; }
    catch { return 'ledger'; }
  });
  useEffect(() => {
    try { localStorage.setItem('easy-cli-proxy-api.quota-layout', layout); } catch { /* Storage can be unavailable. */ }
  }, [layout]);
  const querying = Object.values(quotas).some((quota) => quota.status === 'loading');

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await managementApi.get('/credentials');
      const allFiles = sortAuthFilesByPriority(dedupeAuthFiles(responseList(payload, 'files')));
      const nextFiles = allFiles.filter((file) => !readBoolean(file, 'disabled') && providerForFile(file));
      setFiles(nextFiles);
      const validQuotaKeys = new Set(allFiles.map(quotaKey));
      pruneQuotaCache(validQuotaKeys);
      updateQuotaCache((current) => {
        const next = { ...current };
        nextFiles.forEach((file) => {
          const key = quotaKey(file);
          if (!next[key]) next[key] = idleQuota();
        });
        return next;
      });
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const refreshOne = useCallback(async (file: AuthFile) => {
    const key = quotaKey(file);
    if (getQuotaCacheSnapshot()[key]?.status === 'loading') return;
    const cacheGeneration = captureQuotaCacheGeneration();
    updateQuotaCache((current) => ({ ...current, [key]: { status: 'loading', rows: [] } }));
    const result = await loadQuota(file);
    commitQuotaCacheIfCurrent(cacheGeneration, () => {
      updateQuotaCache((current) => ({ ...current, [key]: result }));
    });
  }, []);

  const resetQuota = useQuotaReset(askConfirmation, setError);

  const refreshMany = useCallback(async (selectedFiles: AuthFile[]) => {
    if (!selectedFiles.length || Object.values(getQuotaCacheSnapshot()).some((quota) => quota.status === 'loading')) return;
    setRefreshing(true);
    setError('');
    const cacheGeneration = captureQuotaCacheGeneration();
    updateQuotaCache((current) => ({
      ...current,
      ...Object.fromEntries(selectedFiles.map((file) => [quotaKey(file), {
        ...current[quotaKey(file)], status: 'loading', rows: [],
      }])),
    }));
    try {
      for (let index = 0; index < selectedFiles.length; index += REFRESH_CONCURRENCY) {
        if (captureQuotaCacheGeneration() !== cacheGeneration) break;
        const batch = selectedFiles.slice(index, index + REFRESH_CONCURRENCY);
        await Promise.all(batch.map(async (file) => {
          const result = await loadQuota(file);
          commitQuotaCacheIfCurrent(cacheGeneration, () => {
            updateQuotaCache((current) => ({ ...current, [quotaKey(file)]: result }));
          });
        }));
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<QuotaProvider, { file: AuthFile; quota: QuotaState }[]>();
    files.forEach((file) => {
      const provider = providerForFile(file);
      if (!provider) return;
      const items = groups.get(provider) ?? [];
      items.push({ file, quota: quotas[quotaKey(file)] ?? idleQuota() });
      groups.set(provider, items);
    });
    return providerOrder.flatMap((provider) => {
      const items = groups.get(provider);
      return items ? [[provider, items] as const] : [];
    });
  }, [files, quotas]);

  const visibleGroups = grouped.filter(([provider]) => providerFilter === 'all' || providerFilter === provider);
  const accountGroups = visibleGroups.map(([provider, items]) =>
    [provider, filterAndSortQuotaAccounts(items, search, sort, locale)] as const,
  ).filter(([, items]) => items.length > 0);
  const visibleFiles = accountGroups.flatMap(([, items]) => items.map(({ file }) => file));

  return (
    <section className="page management-page quota-page" aria-label={t('quota.title')}>
      {confirmationDialog}
      {editingAccount ? <AuthFileSettingsDialog name={editingAccount} onClose={() => setEditingAccount(null)} onSaved={() => { setEditingAccount(null); void loadFiles(); }} /> : null}
      <header className="management-header">
        <div><h1>{t('quota.title')}</h1></div>
        <div className="management-heading-actions">
          <span className="muted-summary">{t(files.length === 1 ? 'quota.queryableCredentials.one' : 'quota.queryableCredentials.other', { count: files.length })}</span>
          <button type="button" className="secondary-button compact-button" onClick={() => void loadFiles()} disabled={loading || refreshing || querying}>
            <RefreshCw size={16} />{t('quota.readList')}
          </button>
          <button type="button" className="secondary-button compact-button" onClick={() => void refreshMany(files)} disabled={refreshing || loading || querying || files.length === 0}>
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />{t('quota.refreshAll')}
          </button>
        </div>
      </header>
      {error ? <MessageNotice message={error} /> : null}
      <AccountRoutingPanel />
      {loading ? (
        <div className="management-loading"><LoaderCircle size={20} className="spin" />{t('quota.loadingFiles')}</div>
      ) : grouped.length === 0 ? (
        <div className="management-empty"><AlertCircle size={24} /><strong>{t('quota.empty.title')}</strong><span>{t('quota.empty.description')}</span></div>
      ) : (
        <>
        <div className="quota-toolbar">
          <div className="quota-provider-filters" role="group" aria-label={t('quota.filterProviders')}>
            <button type="button" aria-pressed={providerFilter === 'all'} onClick={() => setProviderFilter('all')}>{t('quota.allProviders')}<span>{files.length}</span></button>
            {providerOrder.map((provider) => <button type="button" key={provider} aria-pressed={providerFilter === provider} onClick={() => setProviderFilter(provider)}>
              <img src={providerMeta[provider].icon} alt="" className={`quota-icon-${provider}`} />{providerMeta[provider].label}<span>{grouped.find(([key]) => key === provider)?.[1].length ?? 0}</span>
            </button>)}
          </div>
          <label className="quota-layout-control">{t('quota.view')}<select aria-label={t('quota.view')} value={layout} onChange={(event) => setLayout(event.target.value as 'ledger' | 'cards')}>
            <option value="ledger">{t('quota.ledger')}</option><option value="cards">{t('quota.cards')}</option>
          </select></label>
        </div>
        <p className="quota-summary-hint">{t('quota.summaryHint')}</p>
        {visibleGroups.length ? <div className="quota-overview">
          {visibleGroups.map(([provider, items]) => <ProviderQuotaSummary key={provider} provider={provider} items={items} />)}
        </div> : <div className="management-empty">{t('quota.noProviderCredentials')}</div>}
        <div className="quota-account-toolbar">
          <input type="search" className="quota-account-search" aria-label={t('quota.searchAccounts')} placeholder={t('quota.searchAccounts')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="quota-layout-control">{t('quota.sort')}<select aria-label={t('quota.sort')} value={sort} onChange={(event) => setSort(event.target.value as QuotaSort)}>
            <option value="name">{t('quota.sortName')}</option>
            <option value="remaining">{t('quota.sortRemaining')}</option>
            <option value="reset">{t('quota.sortReset')}</option>
          </select></label>
          <button type="button" className="secondary-button compact-button" onClick={() => void refreshMany(visibleFiles)} disabled={refreshing || loading || querying || !visibleFiles.length}>
            <RefreshCw size={16} />{t('quota.refreshVisible', { count: visibleFiles.length })}
          </button>
        </div>
        {search.trim() ? <p className="quota-summary-hint" role="status">{t('quota.searchScope', { count: visibleFiles.length })}</p> : null}
        {visibleGroups.length > 0 && !accountGroups.length ? <div className="management-empty">{t('quota.noMatchingAccounts')}<button type="button" className="secondary-button compact-button" onClick={() => setSearch('')}>{t('quota.clearSearch')}</button></div> : null}
        <div className={`quota-group-list quota-layout-${layout}`}>
          {accountGroups.map(([provider, items]) => (
            <section className="quota-provider-group" key={provider}>
              <div className="quota-group-heading"><div><img src={providerMeta[provider].icon} alt="" className={provider === 'devin' ? 'provider-logo devin-logo' : 'provider-logo'} /><h2>{providerMeta[provider].label}</h2></div><span>{t(items.length === 1 ? 'quota.credentials.one' : 'quota.credentials.other', { count: items.length })}</span></div>
              <div className="real-quota-grid">{items.map(({ file, quota }) => <QuotaCard key={quotaKey(file)} file={file} quota={quota} ledger={layout === 'ledger'} onEdit={isOAuthCredentialFile(file) ? () => setEditingAccount(fileName(file)) : undefined} onRefresh={() => void refreshOne(file)} onReset={provider === 'codex' || provider === 'claude' ? () => void resetQuota(file, quota) : undefined} />)}</div>
            </section>
          ))}
        </div>
        </>
      )}
    </section>
  );
}

export function ProviderQuotaSummary({ provider, items }: { provider: QuotaProvider; items: { file: AuthFile; quota: QuotaState }[] }) {
  const { locale, t } = useI18n();
  const now = useQuotaClock();
  const summaries = summarizeQuotas(items.map(({ quota }) => quota));
  const [selectedLabel, setSelectedLabel] = useState('');
  const preferredLabels = [t('quota.service.window.sevenDayFable'), t('quota.service.window.sevenDay'), t('quota.service.limit.week'), t('quota.service.weekly')];
  const summary = summaries.find(({ label }) => label === selectedLabel)
    ?? preferredLabels.map((label) => summaries.find((item) => item.label === label)).find(Boolean)
    ?? summaries[0];
  const reset = summary ? formatQuotaReset(summary.earliestResetAtMs, undefined, locale, now) : '';
  return <article className="panel quota-provider-summary" aria-label={providerMeta[provider].label}>
    <div className="quota-summary-heading"><strong><img src={providerMeta[provider].icon} alt="" className={`quota-icon-${provider}`} />{providerMeta[provider].label}</strong><span>{t(items.length === 1 ? 'quota.credentials.one' : 'quota.credentials.other', { count: items.length })}</span></div>
    {summary ? <select className="quota-window-select" aria-label={t('quota.summaryWindow', { provider: providerMeta[provider].label })} value={summary.label} onChange={(event) => setSelectedLabel(event.target.value)}>
      {summaries.map(({ label }) => <option key={label} value={label}>{label}</option>)}
    </select> : <span className="quota-summary-placeholder">{t(items.some(({ quota }) => quota.status === 'loading') ? 'quota.querying' : items.some(({ quota }) => quota.status === 'error') ? 'quota.summaryUnavailable' : 'quota.notFetched')}</span>}
    <div className="quota-summary-total"><strong>{summary?.reported ? `${Math.round(summary.totalRemaining)}%` : '—'}</strong><span>{summary?.reported ? t('quota.summaryCapacity', { capacity: summary.capacity }) : t('quota.summaryUnavailable')}</span></div>
    <div className="quota-summary-segments" aria-label={t('quota.accountRemaining')}>
      {items.map(({ file }, index) => {
        const percent = summary?.segments[index] ?? null;
        const description = `${fileName(file)}: ${percent === null ? t('quota.summaryUnavailable') : t('quota.remaining', { percent: Math.round(percent) })}`;
        return <div className={`real-quota-track quota-tone-${quotaTone(percent)}`} key={quotaKey(file)} title={description} role="img" aria-label={description}><span style={{ width: `${percent ?? 0}%` }} /></div>;
      })}
    </div>
    <small>{t('quota.summaryCoverage', { count: summary?.reported ?? 0, total: items.length })}</small>
    {reset ? <small>{t('quota.nextReset', { time: reset })}</small> : null}
  </article>;
}

export function QuotaCard({ file, quota, onRefresh, onReset, onEdit, ledger = false }: { file: AuthFile; quota: QuotaState; onRefresh: () => void; onReset?: () => void; onEdit?: () => void; ledger?: boolean }) {
  const { locale, t } = useI18n();
  const now = useQuotaClock() + (quota.serverTimeOffsetMs ?? 0);
  const provider = providerForFile(file);
  const name = fileName(file);
  const disabled = readBoolean(file, 'disabled');
  return (
    <article className={`panel real-quota-card${ledger ? ' quota-ledger-row' : ''}`}>
      <div className="real-quota-card-header">
        <div><strong title={name}>{name}</strong><span>{provider ? providerMeta[provider].label : t('quota.unknownProvider')}{quota.plan ? ' · ' + quota.plan : ''}</span>
          {quota.subscriptionActiveUntil ? <small>{t('quota.expiresAt', { time: formatQuotaTimestamp(quota.subscriptionActiveUntil, locale) })}</small> : null}
          {quota.status === 'success' && quota.fetchedAt ? <small className="quota-fetched-at">{t('quota.lastUpdated', { time: formatQuotaTimestamp(new Date(quota.fetchedAt).toISOString(), locale) })}</small> : null}
        </div>
        <div className="quota-card-actions">
          {!onEdit ? <span>{t('authFiles.priority.button', { priority: parseAuthFilePriority(file.priority) ?? 0 })}</span> : null}
          {onEdit ? <button type="button" className="secondary-button compact-button" disabled={quota.status === 'loading'} onClick={onEdit} aria-label={t('quota.routing.editPriority', { name })}>{t('authFiles.priority.button', { priority: parseAuthFilePriority(file.priority) ?? 0 })}</button> : null}
          <button type="button" className={ledger ? 'secondary-button compact-button quota-ledger-refresh' : 'icon-button quiet'} onClick={onRefresh} disabled={disabled || quota.status === 'loading'} title={disabled ? t('quota.fileDisabled') : t('quota.refresh')} aria-label={`${disabled ? t('quota.fileDisabled') : t('quota.refresh')}: ${name}`}><RefreshCw size={16} className={quota.status === 'loading' ? 'spin' : ''} aria-hidden="true" />{ledger ? t('quota.refresh') : null}</button>
        </div>
      </div>
      <QuotaActionFeedback quota={quota} name={name} />
      {quota.status === 'idle' ? <div className="quota-card-message"><span>{disabled ? t('quota.fileDisabled') : t('quota.notFetched')}</span><button type="button" className="secondary-button compact-button" onClick={onRefresh} disabled={disabled}>{disabled ? t('quota.disabled') : t('quota.fetch')}</button></div> : null}
      {quota.status === 'loading' ? <div className="quota-card-message"><LoaderCircle size={18} className="spin" />{t(quota.pendingAction === 'reset' ? 'quota.resetting' : 'quota.querying')}</div> : null}
      {quota.status === 'error' ? <>
        <div className="quota-card-error"><AlertCircle size={18} /><span>{t('authFiles.quota.failed')}{quota.error ? <small>{quota.error}</small> : null}</span></div>
      </> : null}
      {quota.status === 'success' && (provider === 'codex' || provider === 'claude') ? <div className="quota-reset-credit-summary">
        {(quota.creditsUnlimited || quota.creditBalance !== undefined) ? <span>{t('quota.creditBalance')} <strong>{quota.creditsUnlimited ? t('quota.creditUnlimited') : quota.creditBalance}</strong></span> : null}
        <ResetCreditExpiries quota={quota} />
        <MessageNotice message={quota.resetCreditsError ? name + ': ' + t('quota.resetCreditsWarning', { error: quota.resetCreditsError }) : null} />
      </div> : null}
      {quota.status === 'success' ? <div className="quota-row-list">{quota.rows.map((row, index) => {
        const reset = formatQuotaReset(row.resetAtMs, row.reset, locale, now);
        return <div className="real-quota-row" key={`${row.label}-${index}`}>
          <div><span>{row.label}</span><strong>{row.remainingPercent === null ? '—' : t('quota.remaining', { percent: Math.round(row.remainingPercent) })}</strong></div>
          {row.remainingPercent !== null ? <div className={`real-quota-track quota-tone-${quotaTone(row.remainingPercent)}`}><span style={{ width: `${Math.max(0, Math.min(100, row.remainingPercent))}%` }} /></div> : null}
          <small>{[row.detail, reset].filter(Boolean).join(' · ')}</small>
        </div>;
      })}</div> : null}
      {onReset && ((quota.resetCredits ?? 0) > 0 || hasPendingClaudeReset(file)) ? <button type="button" className="secondary-button compact-button quota-reset-footer" onClick={onReset} disabled={!canResetQuota(file, quota)} title={t('quota.reset')}>{t(hasPendingClaudeReset(file) ? 'quota.claude.retry' : 'quota.reset')}</button> : null}
    </article>
  );
}
