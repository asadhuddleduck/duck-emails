# Duck Emails

Huddle Duck's existing drip sequence submits individual, permissioned messages to HatchFlow. HatchFlow controls the sender, shared daily limits, suppression, delivery records and replies. This app owns template selection and contact cadence.

Addresses alone never grant marketing permission. Existing contacts stay held until a verified consent record is imported. Queued work never advances the sequence: only a provider acceptance receipt does.

See [the email operations runbook](docs/HATCHFLOW-EMAIL.md) for configuration, migration and recovery. Historical senders are preserved as non-executable text in `docs/email-archive/`.

```sh
npm run dev
npm run test:email
npm run typecheck
npm run lint
```
