CANARY-TOP-DUCK-EMAIL-HF1

# Duck Emails

This Next.js app owns Huddle Duck drip templates and cadence. HatchFlow owns all email transport, shared pacing, suppression, delivery records and replies. Read `docs/HATCHFLOW-EMAIL.md` before changing email operations.

- Source is `duck-emails`, brand is `huddleduck`. Never add a direct provider send, audience sync or Broadcast path.
- Marketing requires verified permission, source eligibility at dispatch, and one-click unsubscribe. Email capture alone is held.
- Keep `sourceJobId` and frozen content stable on retry. Only a receipt with provider ID and acceptance time may advance the contact's step.
- Existing opt-outs and purchaser suppression take priority over any permission import. Do not reset them.
- Preserve delivered unsubscribe links and their signing key. Archived `.retired.txt` files are evidence, never run them.
- Test using local databases and stubbed transport. Never send to a real contact for verification.

CANARY-END-DUCK-EMAIL-HF1
