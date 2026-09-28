# Changelog

## 0.1.8

- Fix: after importing your Windows data, a correct PIN jumped back to the PIN screen on every device, at home or away. Part of the add-on kept looking at the database from before the import. Now the whole add-on switches to the imported data at once, so the PIN opens the app again.

## 0.1.7

- Fix: on a Home Assistant address that starts with `http://` (common at home), a correct PIN jumped straight back to the PIN screen, because the browser refused the sign-in cookie. The cookie now follows the address the browser uses. Correct PINs never counted as failures, so nobody was locked out.
- If the sign-in still does not stick, the PIN screen now says so instead of starting over silently.

## 0.1.6

- Import from Windows no longer needs the Samba add-on: in **Settings → Backup** choose the `moneytrack-import.db` file the PC export created, paste the export code and confirm. The import box now always shows in the add-on; before, it stayed hidden until the file reached the Samba share.
- The Windows export window ends with the next steps and the export code, and opens the folder that holds the file.

## 0.1.5

- Import your data from the Windows app (needs the Samba add-on in this version): run `Export-For-HomeAssistant.bat` on the PC, then open **Settings → Backup** in the add-on, paste the export code and confirm. Transactions, categories, rules, budgets, cards and settings come over; your Home Assistant users, master passwords and PINs stay. Bank passwords are not included — enter them again on the Accounts page. The import requires a signed-in user.
- Lean storage for long-running add-ons: keep only the latest successful bank scrape copy per connection, fetch incrementally (60-day overlap, 365-day floor), compact the database when free pages exceed 20%, and cap Chromium disk cache at 32 MB.
- Net worth and bank assets now use synced account balances, not raw scrape copies, so failed syncs no longer wipe balances from net worth.
- Settings system check shows database size and free disk space on the data volume (warns below 1 GB free).

## 0.1.4

- The screens now call it the **master password** everywhere: setup, second user's setup, unlock after a restart or five wrong PINs, recovery with the recovery key, the rules checklist, error messages and Settings. Setup and unlock explain what it is for, and the recovery-key checkbox spells out that the key is shown only once.
- Stricter check against common passwords: a common word with digits or symbols added at the start or end, or with simple letter swaps (`Password1!`, `!Qwerty123`, `P@ssw0rd#9`), is refused, as is the app name or your HA username written that way. Existing master passwords keep working; the rule applies only when one is set.

## 0.1.3

- Master passphrase rule changed: at least 8 characters (was 12), with an English lowercase letter, an English uppercase letter, a digit and a special character. Common passwords and passphrases containing the HA username are still refused; maximum 256 characters. Applies to first setup, the second user's setup and a new passphrase set with the recovery key. Existing passphrases keep working.
- Setup and recovery show a live checklist of these rules and explain in Hebrew why a passphrase was refused.

## 0.1.2

- Fix: first-time setup failed with an error, so the add-on could never be used. The app opened the encrypted database before its key existed; setup, the status check and every page now decide what to show from the key files alone and open the database only after it is unlocked.
- Fix: opening the panel sent Home Assistant users to the Windows-style username/password page instead of setup, unlock or PIN.
- The first user's setup creates the database, shows the recovery key once, and signs them in. A second allowed user sets up while the vault is unlocked.
- Master passphrases must be at least 12 characters, as documented.
- `clear_lockouts` now works every time it is switched on, not only the first time.

## 0.1.1

- Fix: opening MoneyTrack from the sidebar showed a 404 page. The Supervisor strips the `/api/hassio_ingress/<token>` prefix before forwarding, so nginx now adds it back before passing requests to the app.
- Add the add-on icon and logo to the store.

## 0.1.0

- First release.
