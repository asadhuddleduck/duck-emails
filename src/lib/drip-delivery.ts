import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";
import { createEmailSource, stableEmailJobId, type EmailReceipt, type EmailRequest } from "./hatchflow-email.ts";

export function dripJobId(email: string, emailNum: number): string {
  return stableEmailJobId("drip", email.trim().toLowerCase(), String(emailNum));
}

export function dripAcceptedStatements(request: EmailRequest, receipt: EmailReceipt): InStatement[] {
  const emailNum = Number(request.eligibility?.emailNum);
  if (request.category !== "huddleduck-drip" || !Number.isInteger(emailNum) || emailNum < 1 ||
    request.sourceJobId !== dripJobId(request.to, emailNum)) throw new Error("Acceptance did not match a saved drip step");
  return [
    { sql: `UPDATE drip_contact_state SET last_email_sent = ?, last_sent_at = ?
        WHERE lower(trim(email)) = ? AND last_email_sent = ?`,
      args: [emailNum, receipt.acceptedAt!, request.to, emailNum - 1] },
    { sql: `INSERT INTO drip_sends (cohort, email_num, recipient, status, sent_at)
        VALUES ('hatchflow', ?, ?, 'sent', ?)`, args: [emailNum, request.to, receipt.acceptedAt!] },
  ];
}

export function dripSource(database: Client, overrides?: { endpoint?: string; secret?: string; fetcher?: typeof fetch }) {
  return createEmailSource({ source: "duck-emails", database,
    endpoint: overrides?.endpoint ?? process.env.HATCHFLOW_EMAIL_URL?.trim() ?? "https://hatchflow.app/api/notify/email",
    secret: overrides?.secret ?? process.env.HATCHFLOW_EMAIL_SECRET?.trim() ?? "",
    fetcher: overrides?.fetcher, acceptedStatements: dripAcceptedStatements });
}

export async function dripEligibility(database: Client, request: EmailRequest, now = Date.now()) {
  const emailNum = Number(request.eligibility?.emailNum);
  if (request.source !== "duck-emails" || request.category !== "huddleduck-drip" ||
    request.brand !== "huddleduck" || request.purpose !== "marketing" || !Number.isInteger(emailNum) || emailNum < 1 ||
    request.sourceJobId !== dripJobId(request.to, emailNum)) return { eligible: false, reason: "unknown_drip_job" };
  const result = await database.execute({
    sql: `SELECT cs.last_email_sent, cs.last_sent_at, p.allowed, p.evidence_ref,
        EXISTS(SELECT 1 FROM drip_unsubscribes u WHERE lower(trim(u.email)) = ?) AS suppressed
      FROM drip_contact_state cs LEFT JOIN email_marketing_permissions p ON p.email = lower(trim(cs.email))
      WHERE lower(trim(cs.email)) = ?`, args: [request.to, request.to] });
  const row = result.rows[0];
  if (!row) return { eligible: false, reason: "contact_missing" };
  if (Number(row.suppressed)) return { eligible: false, reason: "unsubscribed_or_purchased" };
  if (Number(row.allowed) !== 1 || !row.evidence_ref) return { eligible: false, reason: "permission_not_verified" };
  if (Number(row.last_email_sent) !== emailNum - 1) return { eligible: false, reason: "step_no_longer_due" };
  const sentAt = String(row.last_sent_at ?? "");
  if (sentAt) {
    const previous = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(sentAt) ? sentAt : `${sentAt.replace(" ", "T")}Z`);
    if (!Number.isFinite(previous) || now - previous < (emailNum <= 4 ? 20 : 44) * 3_600_000) {
      return { eligible: false, reason: "cadence_not_due" };
    }
  }
  return { eligible: true, contentVersion: request.contentVersion };
}

export function dripUnsubscribeToken(email: string, secret = process.env.EMAIL_UNSUB_SECRET?.trim() ?? ""): string {
  if (!secret) throw new Error("EMAIL_UNSUB_SECRET is not set");
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

export function verifyDripUnsubscribe(email: string, token: string, secret?: string): boolean {
  if (!email || !token) return false;
  const expected = Buffer.from(dripUnsubscribeToken(email, secret));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildDripRequest(input: { email: string; emailNum: number; subject: string; html: string; text: string; unsubscribeSecret?: string }): Omit<EmailRequest, "source"> {
  const email = input.email.trim().toLowerCase();
  const query = new URLSearchParams({ e: email, t: dripUnsubscribeToken(email, input.unsubscribeSecret) });
  const unsubUrl = `https://duck-emails-ten.vercel.app/api/email/unsubscribe?${query}`;
  const legacy = "mailto:asad@huddleduck.co.uk?subject=Unsubscribe&body=Please%20remove%20me%20from%20future%20emails";
  return { sourceJobId: dripJobId(email, input.emailNum), brand: "huddleduck", purpose: "marketing",
    to: email, subject: input.subject, html: input.html.replaceAll(legacy, unsubUrl), text: input.text.replaceAll(legacy, unsubUrl),
    category: "huddleduck-drip", unsubUrl,
    contentVersion: createHash("sha256").update(JSON.stringify([input.subject, input.html, input.text])).digest("hex"),
    eligibility: { kind: "drip", emailNum: input.emailNum } };
}
