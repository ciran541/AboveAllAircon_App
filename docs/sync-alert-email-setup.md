# Sync alert emails — setup

The daily cron emails a digest when calendar sync problems need a human. It
delivers through a Google Apps Script web app, the same mechanism already used
for the Sheets backup — so there's no npm package, no API key, and no domain
verification to worry about.

If `GOOGLE_ALERT_WEBHOOK_URL` isn't set, alerting is simply skipped and the
cron still runs normally.

## 1. Create the Apps Script

Go to <https://script.google.com> → **New project**, name it something like
"Aircon Sync Alerts", and replace the contents of `Code.gs` with:

```javascript
// Aircon app — sync alert emailer.
// Receives a digest from the app's daily cron and emails it.

const ALERT_SECRET = 'PUT_A_LONG_RANDOM_STRING_HERE';  // must match GOOGLE_ALERT_SECRET
const RECIPIENT    = 'aaairconpteltd@gmail.com';       // who gets the alerts

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // Shared secret only — this URL is publicly reachable by design.
    if (payload.secret !== ALERT_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    MailApp.sendEmail({
      to: RECIPIENT,
      subject: payload.subject || 'Aircon app: sync alert',
      body: payload.body || '(no details)',
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

Set `ALERT_SECRET` to a long random string and `RECIPIENT` to whoever should
receive alerts (a comma-separated list works too).

## 2. Deploy it

**Deploy → New deployment → Type: Web app**, then:

- **Execute as:** Me
- **Who has access:** Anyone

Approve the permission prompt (it needs permission to send mail as you), then
copy the deployment URL — it ends in `/exec`.

> The "Anyone" setting is what makes the URL reachable without a Google login.
> The shared secret is what actually protects it, which is why it must be long
> and random.

## 3. Add the environment variables

Locally in `.env.local`, and in Vercel under **Settings → Environment
Variables → Production**:

```
GOOGLE_ALERT_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
GOOGLE_ALERT_SECRET=<the same string you used for ALERT_SECRET>
NEXT_PUBLIC_APP_URL=https://your-app-domain.vercel.app
```

`NEXT_PUBLIC_APP_URL` is optional — it just turns the "Review and fix" line in
the email into a working link to the Sync Health page.

## 4. Test it

```bash
curl -H "authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/process-sync-queue
```

The response includes an `alert` field explaining what it decided, e.g.
`{"sent":true,"reason":"new problems"}` or `{"sent":false,"reason":"same
problems, already reported"}`.

## When emails actually arrive

Deliberately restrained, so the alerts stay worth reading:

- **Only the daily cron sends email.** If you're in the app, a failed save
  already tells you inline — an email ten seconds later is noise.
- **One email per run**, listing everything, capped at 10 items.
- **A new problem** → emailed that day.
- **The same unresolved problems** → silent for 7 days, then one reminder.
- **Everything fixed** → a single "healthy again" note.

Auto-repaired problems (deleted or purged events) aren't emailed — they're
already fixed by the time the run finishes. Only things needing a human decision
are: scheduling conflicts, and syncs still failing after retries.
