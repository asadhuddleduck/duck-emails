# HatchFlow email source: duck-emails

HatchFlow owns outbound email, fixed brand identities, canonical legal and unsubscribe footers, provider events, shared limits, and replies. This app owns business eligibility and the durable source ledger. A queued result never means sent. Only `accepted` with `resendId` and `acceptedAt` advances native state. Uncertain results remain held for reconciliation under the same job ID.

## Configuration

| Setting | Value or purpose |
|---|---|
| `HATCHFLOW_EMAIL_URL` | `https://hatchflow.app/api/notify/email` |
| `HATCHFLOW_EMAIL_SECRET` | Distinct source credential, also authenticates callbacks |
| HatchFlow registry source | `duck-emails` |
| Allowed brands | `huddleduck` |
| Registered callback base | `https://duck-emails-ten.vercel.app` |
| `CRON_SECRET` | Existing Vercel cron secret, never an email source fallback |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | This app's existing source database |

The registry uses fixed callbacks `/api/bridge/email/eligibility` and `/api/bridge/email/receipt`. It must never accept an arbitrary callback URL from a submitted job. Configure registry and source credentials together. Remove unused provider sending credentials and sender overrides from this app only after the HatchFlow path is verified. Google mailbox configuration is unrelated and remains in place.

## Safe rollout order

1. Keep HatchFlow marketing paused and old bulk schedulers disabled. Review clean source baseline and preserve other worktrees.
2. Confirm which database this app uses. Run `node --experimental-strip-types scripts/migrate-email-source.mjs` to print the additive schema. With the correct source credentials explicitly loaded, use `--apply`. The script does not load an env file, rewrite old cadence, or grant permission. Back up existing source tables first.
3. Import historical provider and local opt-outs into HatchFlow with the right brand and meaning before marketing resumes. Keep purchaser exclusions local to their sales sequence. Verify existing delivered unsubscribe links still work.
4. Configure this source and its fixed callback registry, then deploy from a clean commit. Confirm authenticated callback and reconciliation access. Do not invoke business send routes using real leads as a test.
5. Check queue status, provider acceptance and native state using an existing legitimate job or an explicitly approved existing seed account. No fake permission, new seed mailbox purchases or automated engagement.
6. Resume eligible marketing only under HatchFlow's phase ceiling and operator health review. Hold when data is too sparse. Complaints pause marketing centrally. Transactional demand is counted in shared provider capacity.

## Durable delivery and recovery

`email_source_jobs` stores immutable JSON before the first HTTP request. Its source job ID identifies a business event, not an attempt. Reusing an ID with different content fails closed. Jobs and receipts persist separately from native cadence. Receipt identity and accepted native updates share one transaction, so a duplicate callback cannot advance twice.

The five-minute `email-reconcile` cron polls HatchFlow for pending, queued and uncertain jobs. A 404 means HatchFlow has no job, so the source resubmits the same saved request. Never generate a new ID to recover an uncertain response. A known accepted job is never posted again. Inspect `email_source_jobs.status`, `reason`, `accepted_at` and `delivery_status` together with the HatchFlow inbox and provider events. Acceptance is not proof of delivery or reading.

Keep the additive tables and delivered unsubscribe routes on rollback. Pause marketing and revert application code only if necessary; do not restore old direct-send cron or bulk scripts. Do not reset accepted jobs or delete their receipts. Resolve uncertain jobs from provider evidence before any replay.

Keep `EMAIL_UNSUB_SECRET` stable after the first deployment. New unsubscribe URLs use a recipient-specific HMAC. GET displays confirmation without changing data; POST records the opt-out without login and mirrors it to HatchFlow. A failed mirror stays in `email_source_suppressions` for reconciliation. Existing delivered provider unsubscribe links remain valid through the provider and its imported suppression history.

Marketing permission is opt-in data, not inferred from an address, purchase, chat or waitlist signup. `email_marketing_permissions` starts empty. Permission imports require evidence of the actual disclosure and affirmative consent plus its recorded timestamp. Do not bulk set `allowed = 1` for historical contacts. Verify provider opt-outs and every existing local suppression before import. A local opt-out always wins. Purchaser exclusion remains specific to the sales sequence.

`POST /api/contacts` with `API_SECRET` still registers a contact without starting marketing. Only an audited caller supplying `marketingConsent: true`, `consentEvidenceRef` and `consentRecordedAt` may record verified permission. For operator imports, dry-run the approved list against existing suppression and contact state, review evidence and counts, then call that endpoint for approved rows. Never reset `last_email_sent` or `last_sent_at`. A 200 `added` response alone is not permission or delivery.

The existing 10 templates are retained as drafts for this source. Review their offers, availability and claims before approving any recipients for a campaign. Genuine eligible demand sets the volume; never add contacts or send filler to meet warm-up ceilings.

The drip selection cron remains daily at 09:00 UTC. Eligibility enforces a 20-hour minimum before steps 2 through 4 and a 44-hour minimum thereafter, measured from provider acceptance. The authenticated reconciliation cron runs every five minutes. `/api/health` exposes aggregate job states, permission holds and suppression mirror backlog, without recipient details. Low volume and no permissioned demand are normal.

## Validation

`npm run test:email` exercises local SQLite databases and stubbed HTTP, including queued/uncertain outcomes, duplicate receipts, immutable content, transaction rollback, missing configuration and current source eligibility. `npm run typecheck` checks application integration. No test sends mail or writes production data.
