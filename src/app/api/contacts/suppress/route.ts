import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.API_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const email = body.email?.trim()?.toLowerCase();
  const reason = body.reason || "manual";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  await db.execute({
    sql: "INSERT OR REPLACE INTO drip_unsubscribes (email, reason) VALUES (?, ?)",
    args: [email, reason],
  });

  console.log(`[contacts] Suppressed ${email} (reason: ${reason})`);

  return NextResponse.json({ ok: true });
}
