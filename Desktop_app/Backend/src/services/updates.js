// Auto-update logic — manual "Check for Updates" only, per the user's
// confirmed decision (never automatic/silent on launch). See
// DECISIONS.md's pipeline-adoption entry and release_pipeline.md §6 Step 7.
//
// Design rules from the reference doc, all load-bearing:
//   - autoDownload = false, always — never download without the user saying yes.
//   - Probe api.github.com specifically before checking, so "the internet
//     works but GitHub is blocked on this network" is a distinct, reportable
//     error instead of a confusing generic failure.
//   - Guard on app.isPackaged — outside a packaged build there's no
//     app-update.yml and no installed version to compare against.
//   - Don't swallow errors from the check itself (private repo, draft
//     release, missing latest.yml are permanent/actionable — reporting them
//     as "you're on the latest version" makes the feature look broken with
//     no clue why). A dropped connection mid-check is different — that's
//     "try again later," not an error worth alarming the user over.
import https from 'node:https';

function probeGitHubReachable() {
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'api.github.com', method: 'HEAD', timeout: 5000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

export class UpdateCheckError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export async function checkForUpdate({ app, autoUpdater }) {
  if (!app.isPackaged) {
    throw new UpdateCheckError('Update checks only work in a packaged build, not during development.', 'not_packaged');
  }

  const reachable = await probeGitHubReachable();
  if (!reachable) {
    throw new UpdateCheckError(
      'Could not reach GitHub. Check your internet connection, or GitHub may be blocked on this network.',
      'github_unreachable'
    );
  }

  autoUpdater.autoDownload = false;
  // checkForUpdates() rejects on real problems (missing latest.yml, draft
  // release, private repo without a token) — let that rejection propagate
  // rather than catching it here, per the "don't swallow errors" rule above.
  const result = await autoUpdater.checkForUpdates();
  const currentVersion = app.getVersion();
  const availableVersion = result?.updateInfo?.version;
  const updateAvailable = !!availableVersion && availableVersion !== currentVersion;

  return { currentVersion, availableVersion: availableVersion || currentVersion, updateAvailable };
}

export function installUpdate({ autoUpdater }) {
  // Only ever called after checkForUpdate() found one AND the user
  // explicitly confirmed — see the frontend page. Downloads now (autoDownload
  // was false), then restarts into the new version once the download completes.
  autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());
  return autoUpdater.downloadUpdate();
}
