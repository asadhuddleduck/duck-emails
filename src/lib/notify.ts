// One Slack sender for this repo. Severity picks the channel: anything that
// needs Asad goes to #alerts (loud), receipts go to #firehose (muted).
// SLACK_WEBHOOK_URL / SLACK_DRIP_WEBHOOK are the pre-migration fallbacks so
// nothing goes dark mid-cutover.

export type Severity = "money" | "lead" | "human" | "broken" | "fyi";

const EMOJI: Record<Severity, string> = {
  money: "\u{1F4B7}",
  lead: "\u{1F3AF}",
  human: "\u{1F64B}",
  broken: "\u{1F534}",
  fyi: "⚪",
};

const PRODUCT = "Duck Emails";

// Slack parses mrkdwn in `text`: literal < > enable <!channel> pings and
// <url|label> spoofed links. Escape every interpolated value.
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notify(a: {
  severity: Severity;
  headline: string;
  details?: (string | null | undefined)[];
  action?: string; // omit => "Nothing to do."
}): Promise<void> {
  // ONE channel, #alerts (3 Aug 2026). The old `fyi` split sent receipts to a
  // muted #firehose that nobody ever opened.
  const routed = process.env.SLACK_ALERT_WEBHOOK_URL;
  const url =
    routed?.trim() ||
    process.env.SLACK_WEBHOOK_URL?.trim() ||
    process.env.SLACK_DRIP_WEBHOOK?.trim();
  if (!url) return;

  const lines = [`${EMOJI[a.severity]} [${PRODUCT}] *${esc(a.headline)}*`];
  for (const d of a.details ?? []) if (d) lines.push(esc(d));
  lines.push(a.action ? `→ ${esc(a.action)}` : "→ Nothing to do.");

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[notify] failed:", err instanceof Error ? err.message : String(err));
  }
}
