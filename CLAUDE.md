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
- **API:** `POST /broadcasts` with a `segment_id` (audience)
- **Use case:** Bulk campaigns, drip sequences, newsletters
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
3. Pick the **lowest group** (everyone catches up before advancing)
4. Check cadence timing (20h or 44h depending on email number)
5. **Diff-sync** the Resend "General" audience (only add/remove changed contacts)
6. Create and send a broadcast
7. Update per-contact state in Turso and log to `drip_sends`

### Lowest-First Strategy
If contacts are at different positions (e.g., 237 at Email 1, 29 at Email 2), the cron only sends to the lowest group each run. This naturally syncs everyone within 1-2 days. Once synced, the whole list advances together.

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
Manual unsubscribe tracking.
```sql
email TEXT PRIMARY KEY,
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
  app/api/cron/send-drip/route.ts  -- Vercel cron (broadcast-based)
  lib/
    db.ts                           -- Turso lazy proxy
    resend.ts                       -- Resend client singleton
    drip-templates.ts               -- All 10 email templates
scripts/
  send-drip.ts                      -- Local CLI sender (transactional, for manual use)
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

### Manual send (bypasses cron, uses transactional API)
```bash
npx tsx scripts/send-drip.ts --dry-run    # preview
npx tsx scripts/send-drip.ts              # send (max 100)
npx tsx scripts/send-drip.ts --limit 50   # send with custom limit
```

### Add contacts to a Resend audience
```bash
npx tsx scripts/add-to-segment.ts <audience-id> <last-email-sent>
```

## Adding New Contacts

To add a new contact to the drip sequence:
1. Insert into `drip_contacts`: `INSERT INTO drip_contacts (email, cohort) VALUES ('new@example.com', 'D')`
2. Insert into `drip_contact_state`: `INSERT INTO drip_contact_state (email, last_email_sent, last_sent_at) VALUES ('new@example.com', 0, '')`
3. The cron will pick them up on the next run (they'll start at Email 1)
4. They'll be added to the Resend audience automatically during the diff-sync

Note: New contacts joining mid-sequence will be behind the main group. The cron's lowest-first strategy means they'll get their emails, but the main group won't advance until the new contact catches up (or you manually advance their state).

## After the Sequence Completes

When all contacts reach Email 10, the cron will return "No active contacts. Sequence complete for all." and do nothing. A Notion task is set for March 23, 2026 to write new templates. To extend the sequence:
1. Add new templates to `drip-templates.ts`
2. Update `TOTAL_EMAILS` constant
3. Deploy - the cron will automatically continue from Email 11
