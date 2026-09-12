import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { createEmailSource, EMAIL_SOURCE_SCHEMA, requireAccepted, authenticateEmailCallback } from "../src/lib/hatchflow-email.ts";

const input = { sourceJobId: "test-message-1", brand: "huddleduck", purpose: "service", to: "person@example.test", subject: "A requested update", text: "Your requested update.", category: "test-service" };
const acceptedAt = "2026-09-12T10:00:00.000Z";
const receipt = (status = "queued", extra = {}) => ({ schemaVersion: 1, source: "duck-emails", sourceJobId: input.sourceJobId, jobId: "hf-test-1", status,
  ...(status === "accepted" ? { resendId: "provider-test-1", acceptedAt } : {}), ...extra });

async function setup(fetcher, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "email-source-test-"));
  const database = createClient({ url: `file:${join(directory, "database.sqlite")}` });
  const close = database.close.bind(database);
  database.close = () => { close(); rmSync(directory, { recursive: true, force: true }); };
  await database.batch([...EMAIL_SOURCE_SCHEMA, "CREATE TABLE native_log (source_job_id TEXT, accepted_at TEXT)"], "write");
  const source = createEmailSource({ source: "duck-emails", database, endpoint: "https://hatchflow.example.test/api/notify/email", secret: "test-source-secret", fetcher,
    acceptedStatements: (request, accepted) => [{ sql: "INSERT INTO native_log VALUES (?, ?)", args: [request.sourceJobId, accepted.acceptedAt] }], ...options });
  return { database, source };
}

test("queued is persisted but advances only once on a real acceptance receipt", async () => {
  const { database, source } = await setup(async (_url, init) => {
    const saved = await database.execute("SELECT COUNT(*) n FROM email_source_jobs");
    assert.equal(saved.rows[0].n, 1, "persist the source job before making a request");
    const payload = JSON.parse(init.body);
    assert.equal(payload.source, "duck-emails");
    assert.equal(payload.from, undefined);
    return Response.json(receipt());
  });
  try {
    assert.equal((await source.submit(input)).status, "queued");
    assert.equal((await database.execute("SELECT COUNT(*) n FROM native_log")).rows[0].n, 0);
    assert.throws(() => requireAccepted(receipt()), /not confirmed/);
    const event = receipt("accepted", { receiptId: "receipt-1", occurredAt: acceptedAt });
    await source.recordReceipt(event);
    await source.recordReceipt(event);
    await source.recordReceipt(receipt("accepted", { receiptId: "receipt-2", deliveryStatus: "delivered", occurredAt: acceptedAt }));
    assert.deepEqual((await database.execute("SELECT * FROM native_log")).rows.map(r => ({ ...r })), [{ source_job_id: input.sourceJobId, accepted_at: acceptedAt }]);
    const late = await source.recordReceipt(receipt("queued"));
    assert.equal(late.status, "accepted");
    assert.equal((await source.getJob(input.sourceJobId)).row.status, "accepted");
  } finally { database.close(); }
});

test("same logical job rejects changed content before another request", async () => {
  let calls = 0;
  const { database, source } = await setup(async () => { calls++; return Response.json(receipt()); });
  try {
    await source.submit(input);
    await assert.rejects(source.submit({ ...input, text: "Changed after queueing" }), /changed content/);
    assert.equal(calls, 1);
  } finally { database.close(); }
});

test("untrusted and incomplete acceptance receipts cannot move native progress", async () => {
  const { database, source } = await setup(async () => Response.json(receipt()));
  try {
    await source.submit(input);
    await assert.rejects(source.recordReceipt(receipt("accepted", { source: "factory" })), /identity/);
    await assert.rejects(source.recordReceipt(receipt("accepted", { resendId: undefined })), /provider id/);
    await assert.rejects(source.recordReceipt(receipt("accepted", { acceptedAt: undefined })), /acceptance time/);
    await assert.rejects(source.recordReceipt(receipt("accepted", { sourceJobId: "unknown" })), /no saved/);
    assert.equal((await database.execute("SELECT COUNT(*) n FROM native_log")).rows[0].n, 0);
  } finally { database.close(); }
});

test("native update and receipt dedupe commit together or both roll back", async () => {
  const { database, source } = await setup(async () => Response.json(receipt()), {
    acceptedStatements: () => ["INSERT INTO not_ready VALUES (1)"],
  });
  try {
    await source.submit(input);
    const event = receipt("accepted", { receiptId: "retryable-receipt" });
    await assert.rejects(source.recordReceipt(event));
    assert.equal((await source.getJob(input.sourceJobId)).row.status, "queued");
    assert.equal((await database.execute("SELECT COUNT(*) n FROM email_source_receipts")).rows[0].n, 0);
    await database.execute("CREATE TABLE not_ready (n INTEGER)");
    await source.recordReceipt(event);
    assert.equal((await source.getJob(input.sourceJobId)).row.status, "accepted");
    assert.equal((await database.execute("SELECT COUNT(*) n FROM not_ready")).rows[0].n, 1);
  } finally { database.close(); }
});

test("lost HTTP response reconciles the same source identity without another send", async () => {
  let posts = 0;
  const { database, source } = await setup(async (url, init) => {
    if (init.method === "POST") { posts++; throw new Error("connection ended"); }
    assert.equal(new URL(url).searchParams.get("sourceJobId"), input.sourceJobId);
    return Response.json(receipt("accepted"));
  });
  try {
    await assert.rejects(source.submit(input), /uncertain/);
    assert.equal((await source.getJob(input.sourceJobId)).row.status, "uncertain");
    await source.reconcile(input.sourceJobId);
    assert.equal((await source.submit(input)).status, "accepted");
    assert.equal(posts, 1);
  } finally { database.close(); }
});

test("crash before first HTTP request retains work and resubmits only its frozen key", async () => {
  let posts = 0;
  const { database, source } = await setup(async (_url, init) => {
    if (init.method !== "POST") return new Response(null, { status: 404 });
    posts++;
    assert.equal(JSON.parse(init.body).sourceJobId, input.sourceJobId);
    return Response.json(receipt("accepted"));
  });
  try {
    const unconfigured = createEmailSource({ source: "duck-emails", database, endpoint: "https://hatchflow.example.test/api/notify/email", secret: "" });
    await assert.rejects(unconfigured.submit(input), /SECRET/);
    assert.equal((await source.getJob(input.sourceJobId)).row.status, "pending");
    await source.reconcile(input.sourceJobId);
    assert.equal(posts, 1);
    assert.equal((await source.getJob(input.sourceJobId)).row.status, "accepted");
  } finally { database.close(); }
});

test("callback authentication fails closed when configuration is missing", () => {
  assert.equal(authenticateEmailCallback(new Request("https://example.test", { headers: { authorization: "Bearer undefined" } }), undefined), false);
  assert.equal(authenticateEmailCallback(new Request("https://example.test", { headers: { authorization: "Bearer test-key" } }), "test-key"), true);
  assert.equal(authenticateEmailCallback(new Request("https://example.test", { headers: { authorization: "Bearer other-key" } }), "test-key"), false);
});
