import { useState } from 'react';
import AppLayout from '@/components/AppLayout';

export default function BackupPage() {
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

  return (
    <AppLayout pageTitle="Backup">
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="card-white p-6">
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
