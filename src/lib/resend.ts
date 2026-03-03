import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY env var is not set");
    resendClient = new Resend(key);
  }
  return resendClient;
}
