# Committee inbox: one-time setup (about 10 minutes)

When someone applies on the website:

- **A new row appears in a Google Sheet.** It has their answers, a **Status** dropdown (New → Reading → Asked a question → Approved / Not this time) and a column for committee notes.
- **Their documents stay in the trustee portal** (nothing is copied to Drive or attached to emails).
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
   The warning appears because this is your own unpublished script. It only asks to use your sheet, to send
   email as you, and to contact the portal database.
3. The sheet now has a formatted **Applications** tab.

## 4. Put it online for the website

1. **Deploy → New deployment**. Click the gear icon and choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**.
   ("Anyone" only means the website can ping it. It acts only on applications that really exist in the portal
   database, once each, and only with the secret that the applicant's own browser holds — so nobody can use the
   link to send emails, add fake rows or read anything.)
3. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

## 5. Connect the website

Send the `/exec` Web app URL and the sheet's URL to whoever manages the site. They go in `src/lib/application.ts`
and `src/content.ts`; pushing to GitHub redeploys the site automatically.

**Test it once:** send a test application on the live site. Within a few seconds you should see a new row and an
email to each admin. Then delete the test row (and the test application in the portal).

## 6. Give the other committee member access

Share the sheet with them (the **Share** button, as *Editor*). Nobody else should be added.

---

## Day to day

- New applications arrive as emails. Click **Open in the applications sheet**.
- Change **Status** as you go. Use **Committee notes** for anything you want to remember.
- To reply, just reply to the notification email. It goes straight to the applicant.
- If an applicant asks for their data to be deleted: in the portal open the application and choose **Delete
  application & documents** (or, if they became a student, delete their documents in the student file); then delete
  their row in this sheet and the notification emails.

## If you change the script later

Go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This keeps the same URL,
so the website doesn't need changing.

## Limits

A regular Gmail account can send about 100 emails a day through scripts. The script never sends more than 25
trustee emails and 20 applicant emails a day (`MAX_…_PER_DAY` at the top), so it can't use the quota up; anything
beyond that still arrives in the sheet and the portal. The database also pauses new applications after 15 in an
hour or 60 in a day.
