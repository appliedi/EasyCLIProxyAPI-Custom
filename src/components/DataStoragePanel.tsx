import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Database, FolderOpen, HardDrive } from 'lucide-react';
import { useI18n } from '../i18n';
import { templateText } from '../i18n/templateConfig';
import { dataStorageMessages } from '../i18n/dataStorage';
import { childDirectory, sameDirectory, type DataStorageSettings, type StorageMode, type StorageOperation, type UsageStorageSettings } from '../services/dataStorage';
import { useConfirmation } from './ConfirmationDialog';
import './DataStoragePanel.css';

export function DataStoragePanel() {
  const { locale } = useI18n();
  const st = (key: keyof typeof dataStorageMessages) => templateText(dataStorageMessages[key], locale);
  const [settings, setSettings] = useState<DataStorageSettings | null>(null);
  const [usage, setUsage] = useState<UsageStorageSettings | null>(null);
  const [mode, setMode] = useState<StorageMode>('user');
  const [custom, setCustom] = useState('');
  const [backup, setBackup] = useState('');
  const [restore, setRestore] = useState('');
  const [restoreDestination, setRestoreDestination] = useState('');
  const [limit, setLimit] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { askConfirmation, confirmationDialog } = useConfirmation();
  const load = async () => {
    setBusy(true); setError('');
    try {
      const [next, records] = await Promise.all([
        invoke<DataStorageSettings>('get_data_storage_settings'),
        invoke<UsageStorageSettings>('get_usage_storage_settings'),
      ]);
      setSettings(next); setUsage(records); setLimit(String(records.maxDatabaseSizeMb));
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const browse = (set: (path: string) => void, child?: string) => void run(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') set(child ? childDirectory(selected, child) : selected);
  });
  const schedule = async (operation: StorageOperation) => {
    const confirmed = await askConfirmation({ title: st('confirm'), message: st('restartHint'), confirmText: st('confirmText'),
      details: [{ label: st('current'), value: settings?.directory ?? '' }, { label: st('destination'), value: operation.destination }],
      warning: operation.kind === 'restore' ? st('restoreHint') : undefined });
    if (!confirmed) return;
    await run(async () => {
      await invoke('schedule_storage_operation', { operation });
      setSettings(await invoke<DataStorageSettings>('get_data_storage_settings'));
    });
  };
  const saveLimit = async () => {
    if (!/^\d+$/.test(limit) || !Number.isSafeInteger(Number(limit))) { setError(st('invalidLimit')); return; }
    if (Number(limit) > 0 && !await askConfirmation({ title: st('saveLimit'), message: st('limitHint'), confirmText: st('saveLimit'), variant: 'danger' })) return;
    await run(async () => {
      const records = await invoke<UsageStorageSettings>('save_usage_storage_settings', { maxDatabaseSizeMb: Number(limit) });
      setUsage(records); setLimit(String(records.maxDatabaseSizeMb)); setMessage(st('limitSaved'));
    });
  };
  const disabled = busy || !!settings?.pending;
  const destination = settings ? mode === 'user' ? settings.userDirectory : mode === 'portable' ? childDirectory(settings.applicationDirectory, 'data') : custom.trim() : '';
  return <div className="data-storage-panel">
    <h2><HardDrive size={20} aria-hidden="true" />{st('title')}</h2>
    <p>{st('description')}</p>
    {error && <p role="alert" className="data-storage-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings ? <><p role="status">{busy ? st('loading') : ''}</p><button className="secondary-button" disabled={busy} onClick={() => void load()}>{st('retry')}</button></> : <>
      <div className="data-storage-current"><strong>{st('current')}</strong><code>{settings.directory}</code><button className="secondary-button compact-button" disabled={busy} onClick={() => void run(async () => { await invoke('open_data_directory'); })}><FolderOpen size={16} />{st('open')}</button></div>
      {settings.lastError && <p role="alert" className="data-storage-error">{settings.lastError}</p>}
      {settings.lastResult && <p role="status">{settings.lastResult}</p>}
      {settings.pending && <div className="data-storage-pending" role="status"><strong>{st('pending')}</strong><code>{settings.pending.destination}</code><div className="data-storage-actions"><button className="primary-button" disabled={busy} onClick={() => void run(async () => { await invoke('restart_for_storage_operation'); })}>{st('restart')}</button><button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await invoke('cancel_storage_operation'); setSettings(await invoke<DataStorageSettings>('get_data_storage_settings')); })}>{st('cancel')}</button></div></div>}
      <fieldset disabled={disabled}><legend>{st('location')}</legend>
        <label>{st('location')}<select aria-label={st('location')} value={mode} onChange={e => setMode(e.currentTarget.value as StorageMode)}><option value="user">{st('user')}</option><option value="portable">{st('portable')}</option><option value="custom">{st('custom')}</option></select></label>
        <label>{st('destination')}<input value={destination} readOnly={mode !== 'custom'} onChange={e => setCustom(e.currentTarget.value)} spellCheck={false} /></label>
        {mode === 'custom' && <button className="secondary-button compact-button" onClick={() => browse(setCustom, 'EasyCLIProxyAPI-data')}>{st('parent')}</button>}
        <p>{mode === 'portable' ? st('portableHint') : st('newFolder')}</p><p>{st('restartHint')}</p>
        <button className="primary-button" disabled={!destination || sameDirectory(destination, settings.directory)} onClick={() => void schedule({ kind: 'move', mode, destination })}>{st('switch')}</button>
      </fieldset>
      <fieldset disabled={disabled}><legend><Database size={17} aria-hidden="true" />{st('history')}</legend><p>{st('limitHint')}</p>
        <label>{st('limit')}<input type="number" min="0" step="1" value={limit} onChange={e => setLimit(e.currentTarget.value)} /></label>
        <button className="secondary-button" disabled={!usage || limit === String(usage.maxDatabaseSizeMb)} onClick={() => void saveLimit()}>{st('saveLimit')}</button>
      </fieldset>
      <fieldset disabled={disabled}><legend>{st('backups')}</legend><p>{st('backupHint')}</p>
        <label>{st('backupDestination')}<input value={backup} onChange={e => setBackup(e.currentTarget.value)} spellCheck={false} /></label>
        <div className="data-storage-actions"><button className="secondary-button" onClick={() => browse(setBackup, `EasyCLIProxyAPI-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`)}>{st('parent')}</button><button className="primary-button" disabled={!backup.trim()} onClick={() => void schedule({ kind: 'backup', destination: backup.trim() })}>{st('backup')}</button></div>
        <hr /><p>{st('restoreHint')}</p>
        <label>{st('restoreSource')}<input value={restore} onChange={e => setRestore(e.currentTarget.value)} spellCheck={false} /></label>
        <button className="secondary-button compact-button" onClick={() => browse(setRestore)}>{st('browse')}</button>
        <label>{st('restoreDestination')}<input value={restoreDestination} onChange={e => setRestoreDestination(e.currentTarget.value)} spellCheck={false} /></label>
        <div className="data-storage-actions"><button className="secondary-button" onClick={() => browse(setRestoreDestination, 'EasyCLIProxyAPI-restored')}>{st('parent')}</button><button className="primary-button" disabled={!restore.trim() || !restoreDestination.trim()} onClick={() => void schedule({ kind: 'restore', backup: restore.trim(), destination: restoreDestination.trim() })}>{st('restore')}</button></div>
      </fieldset>
      <p className="data-storage-locator">{st('locator')}<code>{settings.locator}</code></p>
    </>}
    {busy && settings && <p role="status">{st('working')}</p>}
    {confirmationDialog}
  </div>;
}
