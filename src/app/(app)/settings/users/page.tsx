import { UserIdentity } from "@/components/user-identity";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listPendingInvitations } from "@/modules/settings/invitations";
import { listUsers } from "@/modules/settings/queries";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RevokeInvitationDialog } from "./revoke-invitation-dialog";
import { RemoveUserDialog } from "./remove-user-dialog";
import { InviteUserDialog } from "./invite-user-dialog";
import { SettingsCard } from "../settings-card";

const pill = "h-5 rounded-full border-0 px-2 text-[11px] font-semibold";
/** Role pill (design 1b): admins brand-soft, everyone else neutral. */
const rolePill = (role: string | null | undefined) => cn(pill, role === "admin" ? "bg-brand-soft text-brand-ink" : "bg-muted text-text-secondary");

export default async function UsersSettingsPage() {
  const currentUser = await requireUser();
  if (currentUser.role !== "admin") redirect("/settings/profile");

  const users = listUsers();
  const invitations = listPendingInvitations();
  const format = await getFormatter();
  const t = await getTranslations("settings.users");

  return (
    <SettingsCard title={t("title")} description={t("description")} actions={<InviteUserDialog />}>
      <p className="mb-4 rounded-lg border bg-surface-raised p-3 text-[13.5px] text-text-secondary">{t("signedInAs", { name: currentUser.name, email: currentUser.email })}</p>
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("accountsCount", { count: users.length })}</h2>
      <div className="grid gap-3 md:hidden">
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold"><UserIdentity userId={user.id} name={user.name} /></h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">{user.displayUsername ?? user.username}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Badge variant="secondary" className={rolePill(user.role)}>
                  {user.role === "admin" ? t("roleAdmin") : user.role === "personnel" ? t("rolePersonnel") : t("roleMember")}
                </Badge>
                {user.banned ? <Badge variant="destructive" className={pill}>{t("banned")}</Badge> : null}
              </div>
            </div>
            <p className="mt-3 break-all border-t border-line-soft pt-3 text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-3">
              {user.id === currentUser.id ? <p className="text-sm text-muted-foreground">{t("yourAccount")}</p> :
                <RemoveUserDialog userId={user.id} name={user.name} email={user.email} />}
            </div>
          </article>
        ))}
      </div>
      <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("username")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("userActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium"><UserIdentity userId={user.id} name={user.name} /></TableCell>
              <TableCell>{user.displayUsername ?? user.username}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Badge variant="secondary" className={rolePill(user.role)}>
                    {user.role === "admin"
                      ? t("roleAdmin")
                      : user.role === "personnel"
                        ? t("rolePersonnel")
                        : t("roleMember")}
                  </Badge>
                  {user.banned && (
                    <Badge variant="destructive" className={pill}>{t("banned")}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {user.id === currentUser.id ? <span className="text-sm text-muted-foreground">{t("yourAccount")}</span> :
                  <RemoveUserDialog userId={user.id} name={user.name} email={user.email} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
        <section className="mt-5 border-t border-line-soft pt-5" aria-labelledby="pending-invitations">
          <h2 id="pending-invitations" className="text-sm font-semibold">{t("pendingInvitations")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pendingHint")}</p>
          {invitations.length === 0 && <p className="mt-3 rounded-lg bg-surface-raised p-4 text-[13.5px] text-muted-foreground">{t("noPendingInvitations")}</p>}
          <ul className="mt-3 divide-y divide-line-soft">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="break-all">{invitation.email}</p>
                  <p className="text-muted-foreground">{t("expiresOn", { date: format.dateTime(invitation.expiresAt, { dateStyle: "medium", timeStyle: "short" }) })}</p>
                </div>
                <Badge variant="secondary" className={rolePill(invitation.role)}>
                  {invitation.role === "admin" ? t("roleAdmin") : invitation.role === "personnel" ? t("rolePersonnel") : t("roleMember")}
                </Badge>
                <div className="flex w-full flex-wrap gap-2">
                  <InviteUserDialog invitation={{ email: invitation.email, role: invitation.role }} />
                  <RevokeInvitationDialog invitationId={invitation.id} email={invitation.email} />
                </div>
              </li>
            ))}
          </ul>
        </section>
    </SettingsCard>
  );
}
