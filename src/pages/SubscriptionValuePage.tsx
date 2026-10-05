import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '../i18n';
import { managementApi } from '../services/managementApi';
import { usageProviderDetails } from '../services/usageProvider';
import { combineModels, currentMonth, parseFeeCents, subscriptionSeeds, summarizeValue, validMonth, valueTimeline, type AccountSeed, type SubscriptionValue, type ValueAccount } from '../services/subscriptionValue';
import './SubscriptionValuePage.css';

const MONTH_KEY = 'easy-cli-proxy-api.subscription-value.month';
const initialMonth = () => {
  try { const saved = localStorage.getItem(MONTH_KEY); if (saved && validMonth(saved) && saved <= currentMonth()) return saved; } catch { /* Storage may be unavailable. */ }
  return currentMonth();
};

export function SubscriptionValuePage() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(initialMonth);
  const [report, setReport] = useState<SubscriptionValue | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feeError, setFeeError] = useState('');
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const generation = useRef(0);
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const ratio = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}×`;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    let accounts: AccountSeed[] | null = null;
    try { accounts = subscriptionSeeds(await managementApi.get('/credentials')); } catch { /* Offline history still works. */ }
    try {
      const result = await invoke<SubscriptionValue>('get_subscription_value', { month, accounts });
      if (request !== generation.current) return;
      setReport(result); setOffline(accounts === null);
      setSelected(id => result.accounts.some(a => a.id === id) ? id : null);
    } catch (reason) {
      if (request === generation.current) { setReport(null); setError(String(reason)); }
    } finally { if (request === generation.current) setLoading(false); }
  }, [month]);

  useEffect(() => {
    setReport(null); setEditing(false); setSaved(false);
    try { localStorage.setItem(MONTH_KEY, month); } catch { /* Optional view preference. */ }
    void refresh();
    return () => { generation.current++; };
  }, [month, refresh]);
  useEffect(() => {
    if (editing || saving || loading) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh, editing, saving, loading]);

  const accounts = report?.accounts ?? [];
  const summary = summarizeValue(accounts);
  const filtered = selected ? accounts.filter(a => a.id === selected) : accounts;
  const detail = summarizeValue(filtered);
  const models = combineModels(filtered);
  const selectedAccount = accounts.find(a => a.id === selected);
  const name = (a: ValueAccount) => `${usageProviderDetails(a.provider).name} · ${a.label}`;
  const coverage = (requests: number, priced: number) => requests ? t('subscriptionValue.coverage', { percent: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(priced / requests * 100) }) : t('subscriptionValue.noRequests');
  const startEditing = () => {
    setDraft(Object.fromEntries(accounts.map(a => [a.id, a.monthlyFeeCents === null ? '' : (a.monthlyFeeCents / 100).toFixed(2)])));
    setFeeError(''); setSaved(false); setEditing(true);
  };
  const saveFees = async () => {
    if (!report || saving) return;
    let fees;
    try {
      fees = accounts.map(a => ({ accountId: a.id, monthlyFeeCents: parseFeeCents(draft[a.id] ?? '') }))
        .filter(f => accounts.find(a => a.id === f.accountId)?.monthlyFeeCents !== f.monthlyFeeCents);
    } catch { setFeeError(t('subscriptionValue.invalidFee')); return; }
    setSaving(true); setFeeError('');
    try {
      if (fees.length) await invoke('save_subscription_fees', { month: report.month, fees });
      setEditing(false); setSaved(true); await refresh();
    } catch (reason) { setFeeError(t('subscriptionValue.saveFailed', { error: String(reason) })); }
    finally { setSaving(false); }
  };

  return <section className="page management-page subscription-value-page" aria-label={t('app.nav.subscriptionValue')}>
    <header className="management-header"><div><h1>{t('app.nav.subscriptionValue')}</h1><p>{t('subscriptionValue.subtitle')}</p></div></header>
    <div className="sv-toolbar">
      <label>{t('subscriptionValue.month')}<input type="month" value={month} min="1970-01" max={currentMonth()} disabled={saving} onChange={event => { const next = event.target.value; if (validMonth(next) && next <= currentMonth()) setMonth(next); }} /></label>
      <div className="sv-actions"><button className="secondary-button compact-button" type="button" onClick={() => void refresh()} disabled={loading || editing || saving}><RefreshCw size={15} />{t('subscriptionValue.refresh')}</button>
        <button className="secondary-button compact-button" type="button" onClick={startEditing} disabled={!accounts.length || loading || editing || saving} aria-expanded={editing} aria-controls="sv-fees"><SlidersHorizontal size={15} />{t('subscriptionValue.fees')}</button></div>
    </div>
    {error && <div className="sv-error" role="alert">{t('subscriptionValue.failed', { error })}</div>}
    {offline && <p className="sv-notice">{t('subscriptionValue.offline')}</p>}
    {saved && <p className="sv-notice" role="status">{t('subscriptionValue.saved')}</p>}
    {editing && <form id="sv-fees" className="panel sv-fee-editor" onSubmit={event => { event.preventDefault(); void saveFees(); }}>
      <h2>{t('subscriptionValue.fees')}</h2><p>{t('subscriptionValue.feeHint', { month })}</p>
      <div className="sv-fee-fields">{accounts.map(a => <label key={a.id}>{name(a)}<input type="text" inputMode="decimal" value={draft[a.id] ?? ''} placeholder={t('subscriptionValue.notSet')} disabled={saving} onChange={event => setDraft(old => ({ ...old, [a.id]: event.target.value }))} aria-label={`${name(a)} · USD`} /></label>)}</div>
      {feeError && <p className="sv-error" role="alert">{feeError}</p>}
      <div className="sv-actions"><button type="submit" className="primary-button compact-button" disabled={saving}>{t(saving ? 'subscriptionValue.saving' : 'subscriptionValue.save')}</button><button type="button" className="secondary-button compact-button" disabled={saving} onClick={() => setEditing(false)}>{t('subscriptionValue.cancel')}</button></div>
    </form>}
    {loading && !report && <p role="status">{t('subscriptionValue.loading')}</p>}
    {report && <>
      <div className="sv-period-note">{t(month === currentMonth() ? 'subscriptionValue.toDate' : 'subscriptionValue.closedMonth')}</div>
      <div className="sv-stats" aria-live="polite">
        <article className="panel sv-stat"><span>{t('subscriptionValue.estimate')}</span><strong data-testid="sv-total">{summary.pricedRequests ? money(summary.cost) : '—'}</strong><small>{coverage(summary.requests, summary.pricedRequests)}</small></article>
        <article className="panel sv-stat"><span>{t('subscriptionValue.monthlyFees')}</span><strong>{summary.feeAccounts ? money(summary.fees) : '—'}</strong><small>{t('subscriptionValue.feeCoverage', { count: summary.feeAccounts, total: accounts.length })}</small></article>
        <article className="panel sv-stat"><span>{t('subscriptionValue.ratio')}</span><strong>{summary.pricedRequests ? ratio(summary.ratio) : '—'}</strong><small>{t('subscriptionValue.ratioHint')}</small></article>
      </div>
      {!accounts.length ? <p className="panel sv-empty">{t('subscriptionValue.empty')}</p> : <>
        <div className="sv-section-heading"><h2>{t('subscriptionValue.accounts')}</h2><small>{t('subscriptionValue.select')}</small></div>
        <div className="sv-ledger"><div className="sv-ledger-head" aria-hidden="true"><span>{t('subscriptionValue.account')}</span><span>{t('subscriptionValue.estimate')}</span><span>{t('subscriptionValue.fee')}</span><span>{t('subscriptionValue.valueFee')}</span></div>
          {accounts.map(a => <button type="button" key={a.id} className="sv-account" aria-label={name(a)} aria-pressed={selected === a.id} onClick={() => setSelected(id => id === a.id ? null : a.id)}>
            <span className="sv-identity"><strong>{usageProviderDetails(a.provider).name}</strong><small>{a.label}</small>{!a.current && <small>{t('subscriptionValue.historical')}</small>}</span>
            <span className="sv-amount"><small className="sv-mobile-label">{t('subscriptionValue.estimate')}</small><b>{a.pricedRequests ? money(a.estimatedCost) : a.requests ? '—' : money(0)}</b><span className="sv-share" aria-hidden="true"><span style={{ width: `${summary.cost ? a.estimatedCost / summary.cost * 100 : 0}%` }} /></span>{a.pricedRequests < a.requests && <small>{t('subscriptionValue.partial')}</small>}</span>
            <span className="sv-fee"><small className="sv-mobile-label">{t('subscriptionValue.fee')}</small>{a.monthlyFeeCents === null ? t('subscriptionValue.notSet') : money(a.monthlyFeeCents / 100)}</span>
            <span className="sv-ratio"><small className="sv-mobile-label">{t('subscriptionValue.valueFee')}</small><b>{ratio(a.monthlyFeeCents && (a.pricedRequests || !a.requests) ? a.estimatedCost / (a.monthlyFeeCents / 100) : null)}</b>{a.monthlyFeeCents !== null && a.pricedRequests === a.requests && a.estimatedCost < a.monthlyFeeCents / 100 && <small className="sv-below">{t('subscriptionValue.below')}</small>}</span>
          </button>)}
        </div>
        <div className="sv-section-heading sv-detail-heading"><h2>{selectedAccount ? name(selectedAccount) : t('subscriptionValue.all')}</h2>{selected && <button type="button" className="secondary-button compact-button" onClick={() => setSelected(null)}>{t('subscriptionValue.showAll')}</button>}</div>
        <div className="sv-detail-grid" aria-live="polite">
          <article className="panel sv-trend"><h2>{t('subscriptionValue.trend')}</h2><strong className="sv-detail-total">{detail.pricedRequests ? money(detail.cost) : detail.requests ? '—' : money(0)}</strong><p>{t('subscriptionValue.cumulative')}</p><ValueChart accounts={filtered} month={month} />
            <small className={detail.requests > detail.pricedRequests ? 'sv-below' : ''}>{detail.requests > detail.pricedRequests ? t('subscriptionValue.missing', { count: number(detail.requests - detail.pricedRequests) }) : t(detail.requests ? 'subscriptionValue.priced' : 'subscriptionValue.noRequests')}</small>
          </article>
          <article className="panel sv-models"><h2>{t('subscriptionValue.models')}</h2><table><thead><tr><th scope="col">{t('subscriptionValue.model')}</th><th scope="col">{t('subscriptionValue.requests')}</th><th scope="col">{t('subscriptionValue.estimate')}</th></tr></thead><tbody>{models.map(row => <tr key={row.model}><td><details><summary>{row.model}</summary><div className="sv-token-detail">{t('subscriptionValue.input')}: {number(row.inputTokens)}<br />{t('subscriptionValue.output')}: {number(row.outputTokens)}<br />{t('subscriptionValue.cache')}: {number(row.cacheReadTokens)} / {number(row.cacheCreationTokens)}</div></details>{row.accounts > 1 && <small>{t('subscriptionValue.across', { count: row.accounts })}</small>}</td><td>{number(row.requests)}</td><td>{row.pricedRequests ? money(row.estimatedCost) : '—'}{row.pricedRequests < row.requests && <small>{t('subscriptionValue.partial')}</small>}</td></tr>)}</tbody></table>{!models.length && <p>{t('subscriptionValue.noRequests')}</p>}<small>{t('subscriptionValue.tokens')}</small></article>
        </div>
      </>}
      <footer className="sv-footer"><p>{t('subscriptionValue.foot')}</p>{report.otherRequests > 0 && <p>{t('subscriptionValue.excluded', { count: number(report.otherRequests) })}</p>}<details><summary>{t('subscriptionValue.method')}</summary><p>{t('subscriptionValue.methodBody')}</p><p>{t('subscriptionValue.attribution')}</p></details></footer>
    </>}
  </section>;
}

function ValueChart({ accounts, month }: { accounts: ValueAccount[]; month: string }) {
  const { t, locale } = useI18n();
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(180, entries[0].contentRect.width)));
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  const points = useMemo(() => valueTimeline(accounts, month), [accounts, month]);
  const summary = summarizeValue(accounts);
  const left = 55, right = width - 12, top = 18, bottom = 150;
  const max = Math.max(summary.cost, summary.fees, .01) * 1.08;
  const y = (value: number) => bottom - value / max * (bottom - top);
  const x = (day: number) => left + (right - left) * day / Math.max(points.length, 1);
  const path = `M${left},${bottom} ${points.map(p => `L${x(p.day)},${y(p.cost)}`).join(' ')}`;
  const fmt = (value: number) => new Intl.NumberFormat(locale, { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: value < 1 ? 3 : 1 }).format(value);
  const ticks = points.length < 3 ? [points.length] : [1, Math.ceil(points.length / 2), points.length];
  return <><svg ref={ref} className="sv-chart" viewBox={`0 0 ${width} 182`} role="img" aria-label={`${t('subscriptionValue.trend')} · ${month} · ${fmt(summary.cost)} USD`}>
    <title>{t('subscriptionValue.cumulative')}</title>
    {[0, max / 2, max].map(value => <g key={value}><line className="sv-grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text x={left - 7} y={y(value) + 4} textAnchor="end">{fmt(value)}</text></g>)}
    <path className="sv-area" d={`${path} L${right},${bottom} Z`} />
    {summary.feeAccounts > 0 && <line className="sv-fee-line" x1={left} x2={right} y1={y(summary.fees)} y2={y(summary.fees)} />}
    <path className="sv-cost-line" d={path} />
    {ticks.map(day => <text key={day} x={x(day)} y={173} textAnchor={day === points.length ? 'end' : 'middle'}>{month.slice(5)}-{String(day).padStart(2, '0')}</text>)}
  </svg><div className="sv-legend"><span><i />{t('subscriptionValue.estimate')}</span>{summary.feeAccounts > 0 && <span><i className="sv-fee-key" />{t('subscriptionValue.feeLine')}</span>}</div></>;
}
