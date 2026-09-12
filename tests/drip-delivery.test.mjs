import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { EMAIL_SOURCE_SCHEMA } from "../src/lib/hatchflow-email.ts";
import { buildDripRequest, dripEligibility, dripSource, dripUnsubscribeToken, verifyDripUnsubscribe } from "../src/lib/drip-delivery.ts";
import { mirrorPendingUnsubscribes, suppressDrip } from "../src/lib/email-suppression.ts";

const email = "person@example.test";
const at = "2026-09-12T10:00:00.000Z";
const job = (emailNum = 1) => ({ ...buildDripRequest({ email, emailNum, subject: "Requested information", html: "<p>Information</p>", text: "Information", unsubscribeSecret: "test-unsub-secret" }), source: "duck-emails" });
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), "email-source-test-"));
  const database = createClient({ url: `file:${join(directory, "database.sqlite")}` });
  const close = database.close.bind(database);
  database.close = () => { close(); rmSync(directory, { recursive: true, force: true }); };
  await database.batch([...EMAIL_SOURCE_SCHEMA,
    "CREATE TABLE drip_contact_state (email TEXT PRIMARY KEY, last_email_sent INTEGER, last_sent_at TEXT)",
    "CREATE TABLE drip_unsubscribes (email TEXT PRIMARY KEY, reason TEXT)",
    "CREATE TABLE drip_sends (cohort TEXT, email_num INTEGER, recipient TEXT, status TEXT, sent_at TEXT)",
    { sql: "INSERT INTO drip_contact_state VALUES (?, 0, '')", args: [email] }], "write");
  return database;
}
async function permit(database) {
  await database.execute({ sql: "INSERT INTO email_marketing_permissions (email, allowed, evidence_ref, verified_at) VALUES (?, 1, 'synthetic-opt-in', ?)", args: [email, at] });
}

test("old contacts are held, verified contacts qualify, a later opt-out wins", async () => {
  const database = await setup();
  try {
    assert.equal((await dripEligibility(database, job())).reason, "permission_not_verified");
    await permit(database);
    assert.equal((await dripEligibility(database, job())).eligible, true);
    await suppressDrip(database, email, "unsubscribed");
    assert.equal((await dripEligibility(database, job())).reason, "unsubscribed_or_purchased");
  } finally { database.close(); }
});

test("queueing never advances cadence; acceptance advances once at its actual time", async () => {
  const database = await setup();
  try {
    await permit(database);
    const request = job();
    const queued = { schemaVersion: 1, source: "duck-emails", sourceJobId: request.sourceJobId, jobId: "hf-drip-test", status: "queued" };
    const source = dripSource(database, { endpoint: "https://hatchflow.example.test/api/notify/email", secret: "test-key", fetcher: async () => Response.json(queued) });
    await source.submit(request);
    assert.equal((await database.execute("SELECT last_email_sent FROM drip_contact_state")).rows[0].last_email_sent, 0);
    const accepted = { ...queued, status: "accepted", resendId: "provider-drip-test", acceptedAt: at, receiptId: "drip-receipt-test" };
    await source.recordReceipt(accepted);
    await source.recordReceipt(accepted);
    const row = (await database.execute("SELECT * FROM drip_contact_state")).rows[0];
    assert.equal(row.last_email_sent, 1);
    assert.equal(row.last_sent_at, at);
    assert.equal((await database.execute("SELECT COUNT(*) n FROM drip_sends")).rows[0].n, 1);
    assert.equal((await dripEligibility(database, job(2), Date.parse(at) + 19 * 3600000)).reason, "cadence_not_due");
    assert.equal((await dripEligibility(database, job(2), Date.parse(at) + 20 * 3600000)).eligible, true);
  } finally { database.close(); }
});

test("unsubscribe survives a mirror outage; purchased is not a global marketing opt-out", async () => {
  const database = await setup();
  try {
    await permit(database);
    await suppressDrip(database, email, "purchased");
    assert.equal((await database.execute("SELECT COUNT(*) n FROM email_source_suppressions")).rows[0].n, 0);
    await suppressDrip(database, email, "unsubscribed");
    await suppressDrip(database, email, "purchased");
    assert.equal((await database.execute("SELECT reason FROM drip_unsubscribes")).rows[0].reason, "unsubscribed");
    const options = { endpoint: "https://hatchflow.example.test/api/notify/email", secret: "test-key" };
    assert.equal(await mirrorPendingUnsubscribes(database, { ...options, fetcher: async () => Response.json({ ok: false }) }), 0);
    assert.equal(await mirrorPendingUnsubscribes(database, { ...options, fetcher: async () => { throw new Error("offline"); } }), 0);
    assert.equal((await dripEligibility(database, job())).eligible, false);
    assert.equal(await mirrorPendingUnsubscribes(database, { ...options, fetcher: async () => Response.json({ ok: false }) }), 0);
    assert.equal(await mirrorPendingUnsubscribes(database, { ...options, fetcher: async (url, init) => {
      assert.equal(new URL(url).pathname, "/api/notify/email/suppressions");
      assert.equal(JSON.parse(init.body).brand, "huddleduck");
      return Response.json({ ok: true });
    } }), 1);
  } finally { database.close(); }
});

test("new unsubscribe signatures are recipient-specific and old mailto is replaced", () => {
  const token = dripUnsubscribeToken(email, "test-key");
  assert.equal(verifyDripUnsubscribe(email, token, "test-key"), true);
  assert.equal(verifyDripUnsubscribe("different@example.test", token, "test-key"), false);
  assert.equal(verifyDripUnsubscribe(email, token.slice(1), "test-key"), false);
  assert.match(job().unsubUrl, /^https:\/\/duck-emails-ten\.vercel\.app\/api\/email\/unsubscribe\?/);
});
