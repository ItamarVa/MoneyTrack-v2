# Changelog

## 0.3.4

- **A month now shows what was charged in it:** across the app (home, transactions, credit, analysis, budgets), a card purchase counts in the month the card charges it, not the month you bought it. You can still switch to purchase month on the credit and analysis pages.

## 0.3.3

- **Credit card page:** the month switcher (and "כל התקופה") now appears on this page too, so you can move between months.

## 0.3.2

- **"לטיפול" page:** it now has a title, and the sync problem shows once (in the page card) instead of also in the top banner.
- **All period:** the income and expense ring no longer says "this month" when you look at all your data.
- **Card bills and transfers:** the transaction list shows their real amount (in neutral color) instead of 0.00. Totals are unchanged.
- **Salary:** two salary sources of the same person with the same name now show as one line, and tapping it lists both.

## 0.3.1

- **Credit card page on a computer:** the round chart by category was invisible on wide screens (it is fine on phones); it shows again. The same fix applies to the breakdown pages.

## 0.3.0

- **Credit card page (אשראי):** the next charge per card with its date, a simple switch between purchase month and card charge, a round chart by category (tap to see, tap again or press the button for details), card filter, top merchants and the card transactions.
- **New bottom bar:** לוח · אשראי · עסקאות · לטיפול · עוד. "לטיפול" shows what needs you, with a count: login problems, quick classification of new businesses (one tap per business, with undo) and open alerts.
- **Inside Home Assistant** the app no longer shows a second menu and logo; the top is one row with the month, and the empty bands at the top and bottom are gone. Theme and logout moved to "עוד".
- **Sync when you open the app:** if nothing synced for a day, the app tries right away (at most once every 20 hours per bank, never without login details), shows progress, and explains any problem in plain words with what to do.
- **Home screen:** "this month so far" compared with a usual month, the three biggest categories and the next card charge; recent purchases only; a button to jump to the last month with data.
- **Accounts:** what needs action comes first; rarely used buttons moved to a ⋯ menu; clear bank names (for example "מקס ••1234").
- **Transactions on the phone:** full filters (category, account, type, amount, sort), grouping by day with daily totals, simpler wording.
- **Net worth:** card debt now counts as a debt, not as a negative asset; a note says when the picture is partial; Loans offers to add a mortgage it found in your payments.
- **Alerts:** only real subscription price rises and truly unusual card purchases; one clear sentence each.
- **Budgets:** suggested from your last 3 months with one tap; progress bars; card purchases now count toward budgets and budget alerts.
- **"כל התקופה"** works (it crashed before) and shows a summary of all your data.
- **Advanced tools** (rules, card-company category mapping, export, date basis) moved to Settings → מתקדם.
- **Security:** updated Next.js and other libraries for published security advisories.

## 0.2.0

- **Data stays fresh on its own:** bank and card data now syncs automatically every night (between 02:00 and 05:00 Israel time). If a login fails, it waits until the next night instead of retrying, so the bank does not lock the account.
- **You can see when data is old:** a banner on every page says when nothing synced for 3 days. Each connection on the Accounts page shows its last successful sync, or asks you to enter the login details.
- **A month shows what you bought in it:** November now means purchases made in November, even when the card charges them in December. You can still switch to charge date on the Analysis page.
- **Much less "Uncategorized":** bank lines are categorized automatically: card bills, savings and fund moves, mortgage and loans, salaries and income, taxes and fees, insurance. Common Israeli chains (supermarkets, pharmacies, fuel, phone companies and more) get a category out of the box. A card whose bill comes from the bank but whose details are not connected shows as "חיובי כרטיס אשראי ללא פירוט" until you connect it.
- **Easier category changes:** a searchable list grouped by main category, a "back to automatic" button, and an offer to apply your choice to every transaction of the same business. Two consistent corrections are enough for the app to learn a business.
- **Cleaner categories:** duplicate names are marked in Settings and can be merged; a new category with an existing name under the same parent is refused.
- **Fewer false alerts:** no more "price increase" alerts on savings, fund purchases, mortgage, card bills, taxes or business accounts; old ones close by themselves.
- **Round charts work on the phone:** tapping a slice or a legend row first shows what it is (name, amount, percent) in the middle of the chart and in a card below it; the card's "לפירוט" / "הצג עסקאות" button (or a second tap on the same slice) opens the details. Before, a tap jumped straight to another screen.
- **Phone layout:** the month picker has its own row and never covers the logo, the summary cards fit in a 2x2 grid, an empty month says so instead of showing −100%, and the yearly comparison appears only when last year has enough data.

## 0.1.9

- Fix: the dashboard showed "This page couldn't load" for a month that has income but no expenses yet (early in the month, before card charges arrive). The chart now shows the surplus instead.
- The app now opens on the current month. Before, it kept the last month you picked, even weeks later; a month you pick now lasts until you close the app.

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
