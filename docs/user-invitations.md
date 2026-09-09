# User invitations

Administrators invite users from **Settings → Users → Invite user** (also on
Settings → Profile). Supply an email address and a role. The recipient follows
`/invite?token=…`, chooses a nickname and password, then signs in with those
credentials. The nickname is used as both display name and login username;
login is case-insensitive. Passwords must contain 8–128 characters.

There is no application login requirement for the invitation page. Public
signup remains restricted to the first administrator. If Cloudflare Access is
in front of the application, the recipient must also be allowed by its policy;
see [cloudflare-access.md](cloudflare-access.md).

## Email configuration

Configure these values in `.env.local` for development or in Compose's `.env`
for deployment. Never commit the real values.

```dotenv
BETTER_AUTH_URL=https://your-app.example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=invites@example.com
```

`SMTP_FROM` is a plain sender email address approved by your email provider.
Use port 465 with `SMTP_SECURE=true` for TLS from connection start, or port 587
with `SMTP_SECURE=false` for STARTTLS. TLS is required by default. For a local
mail catcher only, use `SMTP_REQUIRE_TLS=false` and leave both credential fields
empty. The transport uses [Nodemailer's SMTP options](https://nodemailer.com/smtp).

The public URL must point to the address recipients can reach. Invitation email
uses the administrator's current UI language (German or English). The UI reports
missing configuration and delivery failures instead of reporting success.
Acceptance by the SMTP server does not guarantee inbox delivery; check the
provider's delivery status and spam folder when needed.

## Link lifecycle

- Tokens have 256 bits of randomness; only SHA-256 hashes are stored in SQLite.
- Links expire after seven days. Reading/previewing them has no side effects.
- Email delivery must succeed before a link becomes active.
- Sending again to the same address replaces previous unused links only after
  successful delivery; a failed resend leaves the old link usable.
- Account creation, its Better Auth password credential, the marking-color
  preference, and token consumption share one SQLite write transaction.
  Concurrent submissions cannot create two accounts. Any database failure rolls
  back the account and token claim so setup can be retried.
- Email and role come from the stored invitation, never the acceptance form.
  Email is marked verified because the recipient proves possession of the link.
- Existing email addresses are rejected; duplicate nicknames and invalid form
  values leave the invitation available for correction.

Migrations run on application startup. The additive `user_invitations` table
does not change existing accounts or passwords. Tests use isolated databases
and a loopback SMTP catcher; no real invitations are sent by the test suite.

## Removing users

In **Settings → Users**, administrators can choose **Remove user** on another
account and confirm the named account. Their own account cannot be removed.
Removal signs the user out, deletes their credentials, releases their email and
nickname for a fresh invitation, and revokes invitations issued by or addressed
to them. Removed users disappear from account lists and new-user selectors.

The author row and name remain for existing documents, invoices, projects,
calendar records, and other history. This is account removal, not deletion of
business data. Existing assignments remain attached to that historical author
and can be reassigned. Removal cannot be undone; inviting the same email creates
a separate new account without restoring previous access or assignments.

The operation runs in one database transaction and rechecks the acting admin
inside its write lock, preventing concurrent administrators from removing each
other and leaving the platform without an administrator.

## Account switching and administration

Opening an invitation never changes an existing browser session. The setup page
identifies the signed-in account. Its **Go to sign in** button explicitly signs
that account out before opening login, including after an invalid or used link.
The new user then signs in with their chosen nickname and password. Other
browsers remain signed in. Authentication changes use a full navigation to
discard pages cached for the previous account. Failed sign-out stays visible
and can be retried.

The user list identifies the current administrator and explains invitation roles.
Pending invitations have explicit resend and revoke actions. Revoking requires
confirmation, disables pending links (including sends already in flight), and
does not remove existing accounts. An accepted invitation cannot be revoked;
use account removal to withdraw an existing user's access.
