import { createHash, timingSafeEqual } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";

// Mirrored in the three independent caller repositories. HatchFlow owns From,
// Reply-To, provider credentials, sending limits and the final company footer.
export type EmailRequest = {
  source: string;
  sourceJobId: string;
  brand: "superpulse" | "huddleduck";
  purpose: "service" | "support" | "marketing";
  to: string;
  subject: string;
  html?: string;
  text?: string;
  category: string;
  unsubUrl?: string;
  contentVersion?: string;
  eligibility?: Record<string, string | number | boolean | null>;
  attachments?: Array<{ filename: string; content: string; content_type?: string }>;
};

export type EmailReceipt = {
  schemaVersion: 1;
  source: string;
  sourceJobId: string;
  jobId: string;
  status: "accepted" | "queued" | "suppressed" | "failed" | "uncertain";
  resendId?: string;
  acceptedAt?: string;
  deliveryStatus?: string;
  reason?: string;
  receiptId?: string;
  occurredAt?: string;
};

export const EMAIL_SOURCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS email_source_jobs (
    source_job_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    hatchflow_job_id TEXT,
    resend_id TEXT,
    accepted_at TEXT,
    delivery_status TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS email_source_receipts (
    receipt_id TEXT PRIMARY KEY,
    source_job_id TEXT NOT NULL,
    receipt_hash TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_email_source_pending
    ON email_source_jobs(status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS email_marketing_permissions (
    email TEXT PRIMARY KEY,
    allowed INTEGER NOT NULL DEFAULT 0 CHECK(allowed IN (0, 1)),
    evidence_ref TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS email_source_suppressions (
    email TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    mirrored_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
] as const;

export function stableEmailJobId(kind: string, ...parts: string[]): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableJson(v)}`).join(",")}}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function authenticateEmailCallback(request: Request, secret: string | undefined): boolean {
  if (!secret?.trim()) return false;
  const expected = Buffer.from(`Bearer ${secret.trim()}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function requireAccepted(receipt: EmailReceipt): string {
  if (receipt.status !== "accepted" || !receipt.resendId) {
    throw new Error(`Email is ${receipt.status}; provider acceptance is not confirmed`);
  }
  return receipt.resendId;
}

function assertReceipt(value: unknown, source: string): asserts value is EmailReceipt {
  if (!value || typeof value !== "object") throw new Error("Invalid email receipt");
  const r = value as Partial<EmailReceipt>;
  if (r.schemaVersion !== 1 || r.source !== source || typeof r.sourceJobId !== "string" ||
    !r.sourceJobId || typeof r.jobId !== "string" || !r.jobId ||
    !["accepted", "queued", "suppressed", "failed", "uncertain"].includes(r.status ?? "")) {
    throw new Error("Invalid email receipt identity or status");
  }
  if (r.status === "accepted" && (typeof r.resendId !== "string" || !r.resendId ||
    !r.acceptedAt || !Number.isFinite(Date.parse(r.acceptedAt)))) {
    throw new Error("Accepted email receipt needs provider id and acceptance time");
  }
}

type Dependencies = {
  source: "factory" | "duck-emails" | "landing-page";
  database: Client;
  endpoint: string;
  secret: string;
  fetcher?: typeof fetch;
  acceptedStatements?: (request: EmailRequest, receipt: EmailReceipt) => InStatement[];
};

export function createEmailSource(deps: Dependencies) {
  const { database, source } = deps;
  const fetcher = deps.fetcher ?? fetch;

  function configured(): URL {
    if (!deps.secret.trim()) throw new Error("HATCHFLOW_EMAIL_SECRET is not set");
    const endpoint = new URL(deps.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
      throw new Error("HATCHFLOW_EMAIL_URL must be an HTTPS endpoint");
    }
    return endpoint;
  }

  async function getJob(sourceJobId: string) {
    const result = await database.execute({
      sql: "SELECT * FROM email_source_jobs WHERE source_job_id = ?",
      args: [sourceJobId],
    });
    const row = result.rows[0];
    return row ? { row, request: JSON.parse(String(row.payload_json)) as EmailRequest } : null;
  }

  async function recordReceipt(value: unknown): Promise<EmailReceipt> {
    assertReceipt(value, source);
    const receipt = value;
    const tx = await database.transaction("write");
    try {
      const result = await tx.execute({
        sql: "SELECT * FROM email_source_jobs WHERE source_job_id = ?",
        args: [receipt.sourceJobId],
      });
      const row = result.rows[0];
      if (!row) throw new Error("Email receipt has no saved source job");
      const request = JSON.parse(String(row.payload_json)) as EmailRequest;
      if (request.source !== source || (row.hatchflow_job_id && row.hatchflow_job_id !== receipt.jobId)) {
        throw new Error("Email receipt does not match the saved job");
      }
      if (row.resend_id && receipt.resendId && row.resend_id !== receipt.resendId) {
        throw new Error("Email receipt changed the accepted provider id");
      }

      if (receipt.receiptId) {
        const fingerprint = hash(stableJson(receipt));
        const previous = await tx.execute({
          sql: "SELECT receipt_hash FROM email_source_receipts WHERE receipt_id = ?",
          args: [receipt.receiptId],
        });
        if (previous.rows.length) {
          if (previous.rows[0].receipt_hash !== fingerprint) throw new Error("Email receipt id collision");
          await tx.commit();
          return receipt;
        }
        await tx.execute({
          sql: "INSERT INTO email_source_receipts (receipt_id, source_job_id, receipt_hash) VALUES (?, ?, ?)",
          args: [receipt.receiptId, receipt.sourceJobId, fingerprint],
        });
      }

      // A late queued response must never erase an acceptance recorded by the
      // callback that arrived while the original POST was still in flight.
      const alreadyAccepted = row.status === "accepted";
      if (receipt.status === "accepted" && !alreadyAccepted) {
        for (const statement of deps.acceptedStatements?.(request, receipt) ?? []) {
          await tx.execute(statement);
        }
      }
      await tx.execute({
        sql: `UPDATE email_source_jobs
          SET status = ?, hatchflow_job_id = ?, resend_id = COALESCE(resend_id, ?),
              accepted_at = COALESCE(accepted_at, ?),
              delivery_status = COALESCE(?, delivery_status), reason = ?,
              updated_at = CURRENT_TIMESTAMP WHERE source_job_id = ?`,
        args: [alreadyAccepted ? "accepted" : receipt.status, receipt.jobId,
          receipt.resendId ?? null, receipt.acceptedAt ?? null,
          receipt.deliveryStatus ?? null, receipt.reason ?? null, receipt.sourceJobId],
      });
      await tx.commit();
      return alreadyAccepted ? {
        ...receipt, status: "accepted", resendId: String(row.resend_id), acceptedAt: String(row.accepted_at),
      } : receipt;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }

  async function submit(input: Omit<EmailRequest, "source">): Promise<EmailReceipt> {
    const request: EmailRequest = { ...input, to: input.to.trim().toLowerCase(), source };
    if (!request.sourceJobId || !request.category || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.to)) {
      throw new Error("Email source job needs a stable id, category and one recipient");
    }
    if (request.purpose === "marketing" && (!request.contentVersion || !request.unsubUrl)) {
      throw new Error("Marketing email needs a content version and unsubscribe URL");
    }
    const payload = stableJson(request);
    await database.execute({
      sql: `INSERT INTO email_source_jobs (source_job_id, payload_json, payload_hash)
        VALUES (?, ?, ?) ON CONFLICT(source_job_id) DO NOTHING`,
      args: [request.sourceJobId, payload, hash(payload)],
    });
    const saved = await getJob(request.sourceJobId);
    if (!saved || saved.row.payload_hash !== hash(payload)) {
      throw new Error("Email source job id was reused with changed content");
    }
    if (saved.row.status === "accepted") {
      return {
        schemaVersion: 1, source, sourceJobId: request.sourceJobId,
        jobId: String(saved.row.hatchflow_job_id), status: "accepted",
        resendId: String(saved.row.resend_id), acceptedAt: String(saved.row.accepted_at),
      };
    }
    const endpoint = configured();
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${deps.secret}` },
        body: payload, signal: AbortSignal.timeout(20_000),
      });
    } catch {
      await database.execute({
        sql: "UPDATE email_source_jobs SET status = 'uncertain', updated_at = CURRENT_TIMESTAMP WHERE source_job_id = ? AND status != 'accepted'",
        args: [request.sourceJobId],
      });
      throw new Error("HatchFlow response is uncertain; reconcile this same source job before retrying");
    }
    if (!response.ok) throw new Error(`HatchFlow rejected the email request (${response.status})`);
    const receipt: unknown = await response.json();
    assertReceipt(receipt, source);
    if (receipt.sourceJobId !== request.sourceJobId) throw new Error("HatchFlow returned another source job");
    return recordReceipt(receipt);
  }

  async function reconcile(sourceJobId: string): Promise<EmailReceipt> {
    const saved = await getJob(sourceJobId);
    if (!saved) throw new Error("No saved source job to reconcile");
    const url = configured();
    url.searchParams.set("source", source);
    url.searchParams.set("sourceJobId", sourceJobId);
    const response = await fetcher(url, {
      headers: { authorization: `Bearer ${deps.secret}` }, signal: AbortSignal.timeout(20_000),
    });
    // A crash between the local insert and the first HTTP request must not
    // strand a service message. Reuse the frozen job and its same durable key.
    if (response.status === 404) return submit(saved.request);
    if (!response.ok) throw new Error(`HatchFlow status is unavailable (${response.status})`);
    const receipt: unknown = await response.json();
    assertReceipt(receipt, source);
    if (receipt.sourceJobId !== sourceJobId) throw new Error("HatchFlow returned another source job");
    return recordReceipt(receipt);
  }

  async function reconcilePending(limit = 50): Promise<number> {
    const result = await database.execute({
      sql: `SELECT source_job_id FROM email_source_jobs WHERE status IN ('pending', 'queued', 'uncertain')
        ORDER BY updated_at ASC LIMIT ?`, args: [Math.max(1, Math.min(100, limit))],
    });
    let updated = 0;
    for (const row of result.rows) {
      try { await reconcile(String(row.source_job_id)); updated++; } catch { /* Keep the durable pending row. */ }
    }
    return updated;
  }

  return { submit, getJob, recordReceipt, reconcile, reconcilePending };
}
