# Duck Emails

Automated drip email system for Huddle Duck prospect nurturing.

## Architecture

- **Framework:** Next.js (App Router, TypeScript)
- **Database:** Turso (LibSQL) - `duck-emails`
- **Email Provider:** Resend (free tier)
- **Hosting:** Vercel - `duck-emails-ten.vercel.app`
- **Cron:** Vercel cron, daily at 09:00 UTC

## Resend Free Tier Limits (CRITICAL)

Resend has two completely separate email systems with different limits:

### Transactional Emails
- **Limit:** 100 emails/day (soft-enforced around 160-170)
- **API:** `resend.batch.send()` or `resend.emails.send()`
- **Use case:** One-off emails triggered by user actions (receipts, confirmations, password resets)
- **No audience/segment needed** - send directly to any email address
- **Counts against daily quota** - will fail with "daily email sending quota exceeded" when exhausted

### Marketing Emails (Broadcasts)
- **Limit:** UNLIMITED sends, up to 1,000 contacts
- **API:** `POST /broadcasts` with an `audience_id`
- **Use case:** Bulk campaigns, drip sequences, newsletters
- **API field names (CRITICAL):** When creating broadcasts, use `audience_id` (NOT `segment_id`). When adding contacts, use `POST /audiences/{id}/contacts` (NOT `/contacts/{email}/segments/{id}`). These are different Resend API concepts — mixing them causes silent failures.
- **Requires an audience** - contacts must be added to a Resend audience first
- **Audience limit:** 3 audiences on free tier (currently all 3 used)
- **Does NOT count against transactional quota** - completely separate

### Why We Use Broadcasts
With 266 contacts, transactional emails would need 266 sends per day (exceeds 100/day limit).
Broadcasts send to the entire audience in one API call with no daily limit.

## How the Drip System Works

### The Sequence
10 emails, progressively selling the AI Ad Engine (start.huddleduck.co.uk):
- **Emails 1-4:** Daily cadence (20h minimum gap)
- **Emails 5-10:** Every-other-day cadence (44h minimum gap)

Full sequence takes ~18 days to complete.

### Cron Logic (runs daily at 09:00 UTC)
1. Query `drip_contact_state` for all active contacts (excluding unsubscribes and completed)
2. Group contacts by `last_email_sent`
3. Process **ALL groups** sequentially (each gets its own audience sync + broadcast)
4. For each group, check cadence timing (20h or 44h depending on email number)
5. **Diff-sync** the Resend "General" audience (only add/remove changed contacts)
6. Create and send a broadcast
7. Update per-contact state in Turso and log to `drip_sends`
8. Send consolidated Slack summary of all groups processed

### Multi-Group Processing
The cron processes every group independently per run. If contacts are at different positions (e.g., 237 at Email 2, 3 new contacts at Email 0), each group gets its own broadcast. New contacts joining mid-sequence no longer block the main group from advancing.

### Unsubscribe Handling
- Broadcasts use `{{{RESEND_UNSUBSCRIBE_URL}}}` (Resend's one-click unsubscribe, Gmail/Yahoo compliant)
- Manual unsubscribes go to `drip_unsubscribes` table in Turso
- Cron excludes both Resend-unsubscribed contacts and Turso-unsubscribed contacts
- To manually unsubscribe someone: add to `drip_unsubscribes` in Turso AND mark as unsubscribed in Resend

## Database Tables (Turso: duck-emails)

### drip_contact_state (source of truth)
Per-contact tracking of drip progress.
```sql
email TEXT PRIMARY KEY,
last_email_sent INTEGER NOT NULL DEFAULT 0,
last_sent_at TEXT DEFAULT ''
```

### drip_contacts (reference)
Original contact list with cohort labels (historical, not used by cron).
```sql
email TEXT PRIMARY KEY,
cohort TEXT NOT NULL,  -- A, B, or C (original import cohorts)
created_at TEXT DEFAULT (datetime('now'))
```

### drip_sends (audit log)
Every send attempt is logged here.
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
cohort TEXT NOT NULL,      -- 'broadcast' for broadcast sends
email_num INTEGER NOT NULL,
recipient TEXT NOT NULL,
status TEXT NOT NULL,       -- 'sent', 'failed', 'error'
sent_at TEXT DEFAULT (datetime('now')),
error TEXT
```

### drip_unsubscribes
Unsubscribe and suppression tracking. Used for both manual unsubscribes and automated purchaser suppression.
```sql
email TEXT PRIMARY KEY,
reason TEXT DEFAULT 'manual',       -- 'manual', 'purchased', or other reasons
unsubscribed_at TEXT DEFAULT (datetime('now'))
```

## Resend Audiences (3/3 free tier slots)

| Audience | ID | Purpose |
|---|---|---|
| General | `3cadc519-dfdc-4eff-b619-75971113b02f` | **Active drip audience.** Cron syncs this before each broadcast. |
| Systeme.io Import | `5a0fe6aa-d165-4875-a225-6aea956426d2` | Original import (263 contacts with names). Reference only. |
| Agency Clients | `36dc1a64-0985-41f7-ab41-d214f9847e2d` | Legacy agency clients. Not used for drip. |

### Audience Sync (Diff-Based)
The cron does NOT clear and refill the audience each run. It:
1. Lists current audience contacts
2. Compares with the target list from Turso
3. Removes contacts that shouldn't be there
4. Adds contacts that are missing

When everyone is synced (common case), this results in 0 API calls for audience management.

Resend rate limit: 2 requests/second. The cron uses 600ms delays between API calls.

## File Structure

```
src/
  app/
    api/
      contacts/route.ts             -- POST: add contact to drip sequence (auth required)
      contacts/suppress/route.ts    -- POST: suppress contact from drip (auth required)
      cron/send-drip/route.ts       -- Vercel cron (broadcast-based, multi-group)
      health/route.ts               -- Health check endpoint (no auth)
  lib/
    db.ts                           -- Turso lazy proxy
    resend.ts                       -- Resend client singleton
    drip-templates.ts               -- All 10 email templates
scripts/
  add-to-segment.ts                 -- Add contacts to a Resend audience
vercel.json                         -- Cron schedule (0 9 * * *)
```

## Email Templates

All 10 templates are in `src/lib/drip-templates.ts`. Each has:
- `subject`: Email subject line
- `preheader`: Preview text
- `utm`: Campaign tracking parameter
- `html`: Full HTML email body

Templates use a light theme (background #F5F5F5, white cards). CTA links point to `https://start.huddleduck.co.uk` with UTM parameters.

### Template List
1. "I built an AI that runs ads for restaurants" (launch story)
2. "The 4 stages of restaurant advertising" (meme hook)
3. "Their Uber Eats rep actually called them" (case study)
4. "12,000 followers before they served a single pizza" (case studies)
5. "Won't my ads look like they were made by AI?" (objection handling)
6. "What £497 actually buys you" (price reveal)
7. "What happens in the first 72 hours" (behind the scenes)
8. "You could run your own ads. Here's why most don't." (DIY comparison)
9. "I can only set up 5 more this month" (scarcity)
10. "Everything in one place" (final summary)

## Environment Variables

All stored in Vercel and mirrored to `.env.local`:
- `RESEND_API_KEY` - Resend API key
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token
- `CRON_SECRET` - Vercel cron authentication
- `SLACK_DRIP_WEBHOOK` - Slack Incoming Webhook for #email-marketing channel
- `API_SECRET` - Shared secret for `/api/contacts` and `/api/contacts/suppress` (same value as landing-page's `DUCK_EMAILS_API_SECRET`)

## Manual Operations

### Unsubscribe a contact
```bash
turso db shell duck-emails "INSERT INTO drip_unsubscribes (email) VALUES ('email@example.com')"
curl -X PATCH "https://api.resend.com/contacts/email@example.com" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"unsubscribed": true}'
```

### Check current state
```bash
turso db shell duck-emails "SELECT last_email_sent, COUNT(*) FROM drip_contact_state GROUP BY last_email_sent"
```

### Add contacts to a Resend audience
```bash
npx tsx scripts/add-to-segment.ts <audience-id> <last-email-sent>
```

## Monitoring

### Slack Notifications
Every cron run sends a Slack notification (success, skip, or error).
- Env var: `SLACK_DRIP_WEBHOOK` (Vercel + .env.local)
- Channel: #email-marketing

### Health Endpoint
`GET /api/health` — no auth, returns JSON with:
- Contact distribution by email position
- Stuck contacts (>48h without advancing)
- Last broadcast time
- Overall health status (boolean)

## Cross-Project Integration (landing-page <> duck-emails)

The landing-page project calls duck-emails API endpoints to sync the email marketing funnel:

### Chat Email Sync (landing-page -> duck-emails)
When the AI sales chat extracts a visitor's email (F&B, with contact info), `chat/save/route.ts` calls `POST /api/contacts` via `after()` (non-blocking). The contact enters the drip sequence at position 0 and starts receiving emails from the next cron run.

### Purchaser Suppression (landing-page -> duck-emails)
When a purchase completes, `onboarding.ts` calls `POST /api/contacts/suppress` inside `Promise.allSettled` alongside other post-purchase tasks (email confirmation, Notion task, Meta CAPI, etc.). The purchaser is added to `drip_unsubscribes` with `reason = 'purchased'` and excluded from all future drip emails.

### Auth
Both endpoints require `Authorization: Bearer ${API_SECRET}`. Landing-page stores the same value as `DUCK_EMAILS_API_SECRET`.

### Landing-page env vars for this integration
- `DUCK_EMAILS_API_URL` = `https://duck-emails-ten.vercel.app`
- `DUCK_EMAILS_API_SECRET` = same value as duck-emails `API_SECRET`

## Adding New Contacts

### Via API (preferred for integrations)
`POST /api/contacts` with `{ "email": "...", "source": "chat" }` and auth header. Checks suppression/existing before inserting. Returns `{ status: "added" | "exists" | "suppressed" }`.

### Via Turso (manual)
1. Insert into `drip_contacts`: `INSERT INTO drip_contacts (email, cohort) VALUES ('new@example.com', 'D')`
2. Insert into `drip_contact_state`: `INSERT INTO drip_contact_state (email, last_email_sent, last_sent_at) VALUES ('new@example.com', 0, '')`
3. The cron will pick them up on the next run (they'll start at Email 1)
4. They'll be added to the Resend audience automatically during the diff-sync

Note: New contacts joining mid-sequence will be behind the main group. The multi-group cron processes each group independently, so new contacts no longer block the main group from advancing.

## After the Sequence Completes

When all contacts reach Email 10, the cron will return "No active contacts. Sequence complete for all." and do nothing. A Notion task is set for March 23, 2026 to write new templates. To extend the sequence:
1. Add new templates to `drip-templates.ts`
2. Update `TOTAL_EMAILS` constant
3. Deploy - the cron will automatically continue from Email 11
