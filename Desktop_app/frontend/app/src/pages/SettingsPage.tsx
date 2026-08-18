import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import AppLayout from '@/components/AppLayout';
import { updateSettings } from '@/lib/settings';

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const [username, setUsername] = useState(state.settings.username);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [backupRunning, setBackupRunning] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState('');
  const [backupErrorMsg, setBackupErrorMsg] = useState('');

  async function handleBackupToExternalDrive() {
    setBackupSuccessMsg('');
    setBackupErrorMsg('');

    const folderRes = await window.api.backup.selectExternalFolder();
    if (!folderRes.ok) {
      setBackupErrorMsg(folderRes.error?.message || 'Could not open the folder picker.');
      return;
    }
    const destinationFolder = folderRes.data;
    if (!destinationFolder) return; // user cancelled the picker

    setBackupRunning(true);
    try {
      const res = await window.api.backup.runExternal(destinationFolder);
      if (!res.ok) {
        setBackupErrorMsg(res.error?.message || 'Backup failed.');
        return;
      }
      setBackupSuccessMsg(`Backup saved to ${res.data?.filePath}`);
    } finally {
      setBackupRunning(false);
    }
  }

  async function handleSave() {
    setSuccessMsg('');
    setErrorMsg('');

    if (!username.trim()) {
      setErrorMsg('Username is required.');
      return;
    }

    setSaving(true);
    try {
      const result = await updateSettings({
        username,
        oldPassword: oldPassword || undefined,
        newPassword: newPassword || undefined,
      });
      dispatch({ type: 'UPDATE_SETTINGS', settings: { username: result.username } });
      setOldPassword('');
      setNewPassword('');
      setSuccessMsg('Settings saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout pageTitle="Settings">
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card-white p-6">
          <h3 className="font-lora font-semibold mb-5" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>
            Change Password
          </h3>

          {successMsg && <div className="banner-success rounded-lg px-4 py-3 text-sm mb-4">{successMsg}</div>}
          {errorMsg && <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{errorMsg}</div>}

          <div className="flex flex-col gap-4">
            <div>
              <label className="block font-inter font-semibold mb-1.5" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="soleria-input"
              />
            </div>

            <div>
              <label className="block font-inter font-semibold mb-1.5" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>
                Old Password
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => { setOldPassword(e.target.value); setErrorMsg(''); }}
                placeholder="Enter current password"
                className="soleria-input"
              />
            </div>

            <div>
              <label className="block font-inter font-semibold mb-1.5" style={{ fontSize: '12px', color: 'var(--dark-heading)' }}>
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setErrorMsg(''); }}
                placeholder="Leave blank to keep current"
                className="soleria-input"
              />
            </div>

            <button onClick={handleSave} className="btn-gold mt-2" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className="card-white p-6 mt-6">
          <h3 className="font-lora font-semibold mb-2" style={{ fontSize: '18px', color: 'var(--dark-heading)' }}>
            Database Backup
          </h3>
          <p className="font-inter mb-5" style={{ fontSize: '13px', color: 'var(--secondary-text)' }}>
            An automatic backup is taken every hour and saved to the backup folder set up during installation.
            Use the button below to also save a fresh backup to a USB drive or any other folder right now.
          </p>

          {backupSuccessMsg && <div className="banner-success rounded-lg px-4 py-3 text-sm mb-4">{backupSuccessMsg}</div>}
          {backupErrorMsg && <div className="banner-error rounded-lg px-4 py-3 text-sm mb-4">{backupErrorMsg}</div>}

          <button onClick={handleBackupToExternalDrive} className="btn-gold" disabled={backupRunning}>
            {backupRunning ? 'Backing up...' : 'Backup to External Drive...'}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
