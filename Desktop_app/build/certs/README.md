# Code signing certificate (Task 25)

This folder is gitignored — nothing here is ever committed. A self-signed
code-signing certificate (`starmans-selfsigned.pfx`) was generated here on
2026-08-13, per the user's confirmed decision (self-signed for now, real
purchased cert is a config-swap later — see `DECISIONS.md`).

## What was generated

- 2048-bit RSA key, self-signed cert, `CN=Starmans Sole House`, Code Signing
  EKU, valid 730 days from generation
- Packaged as `starmans-selfsigned.pfx` (password-protected PKCS#12)
- The plaintext private key (`key.pem`) was deleted after packaging — only
  the password-protected `.pfx` remains

## Setting up GitHub Actions to use it

`release.yml` reads `CSC_LINK`/`CSC_KEY_PASSWORD` from repo secrets
(electron-builder's standard Windows signing env vars — no `package.json`
config needed, it auto-detects and signs when both are set).

1. Base64-encode the `.pfx`:
   ```bash
   base64 -w0 starmans-selfsigned.pfx
   ```
2. In the GitHub repo (`bilalahmed-04/Starmans-desktop`) → Settings →
   Secrets and variables → Actions, add:
   - `WIN_CSC_LINK` = the base64 output from step 1
   - `WIN_CSC_KEY_PASSWORD` = the password (ask whoever ran the generation
     command — deliberately not written into any file in this repo, not
     even this gitignored one)

## Testing a signed build locally

```bash
export CSC_LINK="$(pwd)/starmans-selfsigned.pfx"   # a file path works locally, unlike CI's base64 string
export CSC_KEY_PASSWORD="..."
cd ../..   # back to Desktop_app/
npm run dist:win
```

## Verifying a build is actually signed

On a real Windows machine (this cannot be checked from Linux): right-click
the built `.exe` → Properties → Digital Signatures tab, or `signtool verify
/pa Starmans-Sole-House-Setup-*.exe`.

## Swapping in a real certificate later

Replace the two GitHub secrets (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) with
the real certificate's base64 content and password — nothing else in the
pipeline changes. This is exactly why env-var-based signing was chosen over
hardcoding a cert path in `package.json`.
