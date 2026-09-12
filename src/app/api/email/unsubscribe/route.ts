import { db } from "@/lib/db";
import { verifyDripUnsubscribe } from "@/lib/drip-delivery";
import { mirrorPendingUnsubscribes, suppressDrip } from "@/lib/email-suppression";

function verified(request: Request): string | null {
  const url = new URL(request.url);
  const email = url.searchParams.get("e")?.trim().toLowerCase() ?? "";
  return verifyDripUnsubscribe(email, url.searchParams.get("t") ?? "") ? email : null;
}

// Link scanners can GET without changing a person's preferences.
export async function GET(request: Request) {
  if (!verified(request)) return new Response("This unsubscribe link is invalid.", { status: 400 });
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Huddle Duck email preferences</title><body><main><h1>Stop marketing emails</h1><p>Press the button to stop Huddle Duck marketing emails.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></body></html>', {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export async function POST(request: Request) {
  const email = verified(request);
  if (!email) return new Response("This unsubscribe link is invalid.", { status: 400 });
  await suppressDrip(db, email, "unsubscribed");
  await mirrorPendingUnsubscribes(db);
  return new Response("You are unsubscribed from Huddle Duck marketing emails.", { headers: { "cache-control": "no-store" } });
}
