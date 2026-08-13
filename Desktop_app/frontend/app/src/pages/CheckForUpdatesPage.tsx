import { useState } from 'react';
import AppLayout from '@/components/AppLayout';

type CheckResult = { currentVersion: string; availableVersion: string; updateAvailable: boolean };

export default function CheckForUpdatesPage() {
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleCheck() {
    setErrorMsg('');
    setResult(null);
    setChecking(true);
    try {
      const res = await window.api.updates.check();
      if (!res.ok) {
        setErrorMsg(res.error?.message || 'Could not check for updates.');
        return;
      }
      setResult(res.data ?? null);
    } finally {
      setChecking(false);
    }
  }

  async function handleInstall() {
    setErrorMsg('');
    setInstalling(true);
    try {
      const res = await window.api.updates.install();
      if (!res.ok) {
        setErrorMsg(res.error?.message || 'Update download failed.');
        setInstalling(false);
      }
      // On success the app restarts itself (quitAndInstall) — no further
      // state update needed here, this component won't exist to receive one.
    } catch {
      setErrorMsg('Update download failed.');
      setInstalling(false);
    }
  }

  return (
    <AppLayout pageTitle="Check for Updates">
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card-white p-6">
          <h3 className="font-lora font-semibold mb-2" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>
            Software Updates
          </h3>
          <p className="font-inter mb-5" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
            Updates are never downloaded automatically — check here whenever you'd like, and you'll always be asked before anything installs.
          </p>

          {errorMsg && <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{errorMsg}</div>}

          {result && !result.updateAvailable && (
            <div className="banner-verified rounded-lg px-4 py-3 text-sm mb-4">
              You're up to date — running version {result.currentVersion}.
            </div>
          )}

          {result && result.updateAvailable && (
            <div className="banner-info rounded-lg px-4 py-3 text-sm mb-4">
              Version {result.availableVersion} is available (you're on {result.currentVersion}).
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleCheck} className="btn-gold" disabled={checking || installing}>
              {checking ? 'Checking...' : 'Check for Updates'}
            </button>

            {result?.updateAvailable && (
              <button onClick={handleInstall} className="btn-gold" disabled={installing}>
                {installing ? 'Downloading...' : 'Update Now'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
