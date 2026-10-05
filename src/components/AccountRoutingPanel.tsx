import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '../i18n';

type SessionRoutingSettings = {
  routingSessionAffinity: boolean;
  routingSessionAffinityTtl: string;
};

export function AccountRoutingPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SessionRoutingSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [ttl, setTtl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void invoke<SessionRoutingSettings>('get_core_config_settings').then((result) => {
      if (!active) return;
      setSettings(result);
      setEnabled(result.routingSessionAffinity);
      setTtl(result.routingSessionAffinityTtl);
    }).catch((reason: unknown) => {
      if (active) setError(String(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const dirty = settings !== null && (enabled !== settings.routingSessionAffinity || ttl.trim() !== settings.routingSessionAffinityTtl);
  const save = async () => {
    if (!settings || !dirty || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      // Save only affinity fields; preserve the user's routing strategy and retry settings.
      const result = await invoke<SessionRoutingSettings>('save_session_routing_settings', {
        settings: { routingSessionAffinity: enabled, routingSessionAffinityTtl: ttl.trim() },
      });
      setSettings(result);
      setEnabled(result.routingSessionAffinity);
      setTtl(result.routingSessionAffinityTtl);
      setSaved(true);
    } catch (reason) {
      setError(String(reason));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <details className="panel account-routing-panel">
    <summary>{t('quota.routing.title')}<span>{loading ? t('common.loading') : settings ? t(settings.routingSessionAffinity ? 'quota.routing.enabled' : 'quota.routing.disabled') : t('common.unavailable')}</span></summary>
    <p>{t('quota.routing.priorityHint')}</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={loading || saving || !settings}>
        <label className="quota-affinity-toggle"><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSaved(false); }} />{t('config.network.sessionAffinity')}</label>
        <label className="quota-layout-control">{t('quota.routing.idleTimeout')}<input aria-label={t('quota.routing.idleTimeout')} value={ttl} placeholder="1h" onChange={(event) => { setTtl(event.target.value); setSaved(false); }} /></label>
        <button type="submit" className="primary-button compact-button" disabled={!dirty || saving}>{t(saving ? 'common.saving' : 'common.save')}</button>
      </fieldset>
    </form>
    <p>{t('quota.routing.affinityHint')}</p>
    <p>{t('quota.routing.projectHint')}</p>
    <p className="quota-summary-hint">{t('quota.routing.cacheHint')}</p>
    {error ? <p role="alert" className="quota-routing-error">{error}</p> : null}
    {!settings && !loading ? <button type="button" className="secondary-button compact-button" onClick={() => setAttempt((value) => value + 1)}>{t('common.refresh')}</button> : null}
    {saved && !dirty ? <p role="status">{t('config.notice.sessionRoutingUpdated')}</p> : null}
  </details>;
}
