# MoneyTrack Home Assistant add-on

Operator guide for install, Windows migration, and on-device acceptance.

## Container image (GHCR)

Pre-built images are published from the public repository on every push to `main` that touches the add-on or app sources (see `.github/workflows/addon-image.yml`).

| Tag | Image |
|-----|--------|
| Version from `config.yaml` | `ghcr.io/itamarva/moneytrack-amd64:0.1.4` |
| Latest successful build | `ghcr.io/itamarva/moneytrack-amd64:latest` |

`config.yaml` uses `image: ghcr.io/itamarva/moneytrack-{arch}` (Supervisor substitutes `amd64`). If GHCR is unavailable, comment out `image` and let the Supervisor build from `ha-addon/moneytrack/Dockerfile` (slow; needs disk for Node + Chromium).

After a public release, confirm the workflow on GitHub **Actions → Add-on image**. First install may need a few minutes until `latest` exists.

## Installation in Home Assistant

### 1. Add the add-on store repository

Home Assistant reads **`repository.yaml` at the repository root** (not inside this folder). That file points at `https://github.com/ItamarVa/MoneyTrack-v2`. The add-on definition lives in **`ha-addon/moneytrack/`** (`config.yaml`, Dockerfile, s6/nginx).

1. Open **Settings → Add-ons → Add-on store**.
2. Open the **⋮** menu → **Repositories**.
3. Add: `https://github.com/ItamarVa/MoneyTrack-v2`
4. **Check for updates** / refresh the store.

If the store still shows an old version after a force-pushed public release, remove the repository and add it again (HA caches the git ref).

### 2. Install and configure

1. Under **MoneyTrack**, choose **Install** (pulls the GHCR image when configured).
2. Open the **Configuration** tab.
3. Set **allowed_users** to JSON-style list of HA usernames who may use the app, for example:

   ```yaml
   allowed_users:
     - alex
     - partner
   ```

   Users not on this list see a “no access” page. Only the HA administrator can edit Configuration.

4. Leave **clear_lockouts** `false` unless recovering from an unexplained lockout (see Troubleshooting).
5. **Start** the add-on.
6. Open **MoneyTrack** from the sidebar (`mdi:cash-multiple`). Traffic goes through **Ingress** (your HA login and MFA apply).

Data lives under `/data` inside the add-on. `/share` is mounted read-write for one-time import (`moneytrack-import`).

### 3. First enrollment (each allowed user)

On a user’s **first** visit through Ingress:

1. Set a **master password** (it opens your encrypted data) and tick the box confirming that you will save the recovery key shown on the next step. The master password needs at least 8 characters, including an English lowercase letter (a-z), an English uppercase letter (A-Z), a digit and a special character (anything that is not a letter or digit — a space counts). Hebrew letters are allowed but count as neither lowercase nor uppercase. It must not be a common password or contain the HA username; the maximum is 256 characters. The form ticks each rule off as you type. The same rule applies when you set a new master password with the recovery key. Common words dressed up with digits or symbols at the start or end, or with simple letter swaps (`Password1!`, `!Qwerty123`, `P@ssw0rd#9`), are refused too.
2. Set a **6-digit PIN** for daily unlock.
3. If this is the **first** enrollment in the household, the wizard creates the encrypted database and shows a **recovery key once** — store it in a password manager or print it; it cannot be shown again.
4. To bring over Windows data, see **Migrate data from Windows** below; the import runs from Settings after enrollment.

The **second** allowed user enrolls the same way, but only while the vault is unlocked (the first user has unlocked it since the last restart). If the add-on restarted in between, the second user sees the unlock page until the first user unlocks.

After every **add-on or host restart**, someone must enter their **master password** again before anyone can use a PIN. Five wrong PINs also ask for the master password.

Add-on log lines to look for: `[ha] enrolled user <id> (vault created)` (first setup), `[ha] enrolled user <id>` (second user), `[ha] vault unlocked by user <id>`, `[agent] ... agent ready` (the agent got the key). Failures log `[ha] enroll failed: …`, `[ha] unlock refused: <code>` or `[ha] PIN locked for user <id>`.

### 4. Migrate data from Windows (one time)

On the **Windows PC** where MoneyTrack still runs (install root = folder that contains `repo/` and `Export-For-HomeAssistant.bat`):

1. Double-click **`Export-For-HomeAssistant.bat`** at the install root (not inside `repo/`).
2. Watch the progress bar. When finished, the window shows the **export code** (passphrase) and opens the folder with `moneytrack-import\moneytrack-import.db`.
3. In the add-on, after enrollment, open **Settings → Backup** (הגדרות → גיבוי), choose that file, paste the export code and confirm. Uploads up to 32 MB.

Optional Samba route: set `MONEYTRACK_HA_IMPORT_DEST` (for example `\\homeassistant\share\moneytrack-import`) before the export and the script copies the file to the share instead; Settings → Backup then imports it without choosing a file.

The import replaces all data in the add-on (transactions, categories, rules, budgets, cards, settings) with the Windows data. Enrolled HA users, their master passwords and PINs stay; a Windows user with the same username is renamed `<name>-windows`. The uploaded or shared file is deleted from the add-on after the import. The export code is shown only once; if it is lost, run the export again for a new file and code.

Bank credentials are **not** in the export; re-enter them for each connection on the **Accounts** page in the add-on.

### 5. Retire the Windows app

Only after the **acceptance checklist** below is fully green:

1. Stop daily use of **`Start-MoneyTrack.bat`** (and related serve scripts if any).
2. Keep the Windows install until you are confident in HA backups and master passwords/recovery key.
3. Optional: uninstall the Windows scheduled task or shortcuts so the PC no longer binds `127.0.0.1:3100`.

## Requirements

- Home Assistant OS or Supervised on **amd64** (mini PC).
- Node 24 and Chromium run inside the container; only nginx listens on port **8099**, and only from the Supervisor address `172.30.32.2`.

## Acceptance checklist (on-device)

Use this after install and before retiring the Windows app.

- [ ] Open from the HA mobile app sidebar over your public URL (cellular).
- [ ] First allowed user enrolls, saves the recovery key, imports the Windows export from Settings → Backup; monthly totals match Windows.
- [ ] Second allowed user enrolls from another phone; a third HA user sees no access.
- [ ] Restart add-on: master password required, then PIN-only for the other user.
- [ ] 15 minutes idle → PIN screen; five wrong PINs → master password; `clear_lockouts` in Configuration recovers unexplained lockout once.
- [ ] One user resets the other’s PIN from Settings.
- [ ] Bank credentials entered and sync with OTP from the phone.
- [ ] HA backup completes; backup archive has no `puppeteer/` tree.
- [ ] Every main page usable on phone (portrait, landscape, dark mode); CSV export works in the HA app.
- [ ] Optional: iOS “Require Face ID” on the Home Assistant app icon.

## Troubleshooting

- **Blank or broken UI after update:** restart the add-on so `apply-base-path` can refresh the ingress prefix.
- **POST requests fail with CSRF:** access only through HA ingress (not a direct port forward).
- **Correct PIN loops back to the PIN screen:** the browser refused the session cookie. From 0.1.7 the cookie drops `Secure` when HA is opened over `http://`; on older versions use an `https://` HA address. If it started right after a Windows import, restart the add-on (fixed in 0.1.8).
- **Scraper fails:** check add-on logs; Chromium path is `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.
- **Lockouts:** wrong PIN five times → master password. Five wrong master passwords → wait 15 minutes (or restart the add-on). Unexplained lockout → set `clear_lockouts` true, restart once, then turn it off again.
- **Setup says a database exists without keyslots:** `/data/keyslots.json` is missing while `/data/moneytrack.db` exists. Nobody can open that database without its keyslots; restore `/data` from an HA backup. The add-on never overwrites either file.
- **GHCR pull errors:** verify Actions built `ghcr.io/itamarva/moneytrack-amd64:latest` or temporarily build from Dockerfile.
