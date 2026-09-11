# Local five-person demo

This optional, fictional scenario models Alpenblick Digital, a small Austrian
software and municipal-research team. It is never part of boot seeding or a
production migration. No existing database is copied or modified.

Run from the repository root:

```powershell
npm run scenario:create
# Stop the normal local server on port 3000 first.
npm run dev:scenario
# In another terminal, generate a bounded run of five authenticated users:
npm run traffic:scenario
# Once the PDF worker has processed the nine research PDFs:
npm run scenario:verify
```

Creation refuses to overwrite `data/local-scenario`. It always targets that
directory's `scenario.db` and `uploads`, regardless of `.env.local`. Production
mode is rejected. Creation is one-shot; if interrupted, preserve the partial
directory under another name before creating a new scenario. Neither command
contains a reset or deletion operation.

The dedicated launcher binds to loopback, uses real logins, disables outgoing
invitation email and figure-folder sync, and preserves the original environment
file. Ordinary `npm run dev` continues to use the original configuration.

The generated, git-ignored `data/local-scenario/LOGIN.md` contains the five
usernames and a randomly generated shared demo password. Anna is the admin,
Miriam has personnel access, and Lukas, David and Sofia are members.

The dataset includes active and archived projects, task dependencies and multiple
assignees, wiki-origin tasks and deadlines, overlapping calendar use, recurring
meetings and absences, employees/contracts/hour allocations, paid/unpaid/draft/
canceled invoices, cash-basis entries and receipts, category budgets, funding
budgets and evidence, wiki pages/documents/revisions/comments, research PDFs,
presentations, and personal municipality analyses. Municipality source data is
the existing bundled dataset; fictional statements are confined to demo records.

Dates are relative to creation. Invoice sequences are gapless within the demo
year. Paid invoices have matching ledger income; drafts and unpaid invoices do
not. Tax and payment lines agree with integer-cent entry totals. Fixtures do not
send email or create real financial transactions.

`traffic:scenario` performs five real sign-ins, checks the demo identities, and
visits 15 local routes twice per user, capped at five concurrent requests. It
does not follow redirects and has no configurable remote target. It produces
`data/local-scenario/traffic-report.json` and exits; it is not a continuing load
test. Fixture writes are performed by the creator, not the traffic runner.

Verification results and counts live alongside the manifest. All database,
uploads, credentials and traffic reports remain ignored by Git. The script and
documentation may be committed; do not commit the generated local data.
