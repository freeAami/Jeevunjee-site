# Committee inbox: one-time setup (about 10 minutes)

When someone applies on the website:

- **A new row appears in a Google Sheet.** It has their answers, a **Status** dropdown (New → Reading → Asked a question → Approved / Not this time) and a column for committee notes.
- **Their documents are saved to a private Google Drive folder**, one sub-folder per applicant. The row links to it.
- **Altaf and Imran get an email** with the application and an **"Open in the applications sheet"** button. Documents are never attached to emails.
- **The applicant gets a short confirmation email** with their reference number, if they gave an email address.

To download everything as Excel: in the sheet, **File → Download → Microsoft Excel (.xlsx)**.

It's free. There are no new accounts, logins or servers: it runs inside the Google account that owns the sheet.

---

## 1. Create the sheet

1. Sign in to the Google account that should **own** the applications. Ideally that's a shared committee account rather than a personal one.
2. Go to <https://sheets.new> and name the sheet **Jeevunjee applications**.

## 2. Add the script

1. In the sheet: **Extensions → Apps Script**.
2. Delete what's in the editor, then paste in the whole of [`Code.gs`](./Code.gs).
3. At the top, set the email addresses to notify:
   ```js
   const ADMIN_EMAILS = ['first-admin@gmail.com', 'second-admin@gmail.com'];
   ```
4. Click **Save** (the disk icon).

## 3. Run setup once

1. In the toolbar's function dropdown, choose **setup**, then click **Run**.
2. Google asks for permission. Choose the account, then **Advanced → Go to project (unsafe) → Allow**.
   The warning appears because this is your own unpublished script. It only asks to use your sheet, your Drive
   (for the documents folder) and to send email as you.
3. The sheet now has a formatted **Applications** tab, and your Drive has a folder called
   *Jeevunjee applications — documents (private)*.

## 4. Put it online for the website

1. **Deploy → New deployment**. Click the gear icon and choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**.
   ("Anyone" only means the website can *send* applications in. Nobody can read the sheet through this link.)
3. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

## 5. Connect the website

The website lives on GitHub Pages and reads two links from the repository's settings. Either send both links to
whoever manages the site, or add them yourself: on GitHub, open the repo → **Settings → Secrets and variables →
Actions → Variables tab → New repository variable**:

| Name | Value |
| --- | --- |
| `VITE_SUBMIT_ENDPOINT` | the `/exec` Web app URL from step 4 |
| `VITE_COMMITTEE_URL` | the sheet's own URL, from the browser address bar |

Then go to **Actions → Deploy to GitHub Pages → Run workflow**. After about a minute the live site sends
applications to the sheet, and **Committee access** in the footer opens it.

**Test it once:** send a test application on the live site. Within a few seconds you should see a new row, a new
documents folder and an email to each admin. Then delete the test row and folder.

## 6. Give the other committee member access

Share **both** the sheet and the documents folder with them (the **Share** button, as *Editor*). Nobody else
should be added.

---

## Day to day

- New applications arrive as emails. Click **Open in the applications sheet**.
- Change **Status** as you go. Use **Committee notes** for anything you want to remember.
- To reply, just reply to the notification email. It goes straight to the applicant.
- If an applicant asks for their data to be deleted, delete their row and their documents sub-folder.

## If you change the script later

Go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps the same URL,
so the website doesn't need changing.

## Limits

A regular Gmail account can send about 100 emails a day through scripts. That's far more than this needs.
