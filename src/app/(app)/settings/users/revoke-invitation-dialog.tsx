"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { revokePlatformInvitation } from "@/modules/settings/user-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function RevokeInvitationDialog({ invitationId, email }: { invitationId: string; email: string }) {
  const t = useTranslations("settings.users");
  const common = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await revokePlatformInvitation({ invitationId });
      if (result.error) {
        setError(t(result.error));
        return;
      }
      setOpen(false);
      toast.success(t("invitationRevoked"));
      router.refresh();
    } catch {
      setError(common("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!pending) { setOpen(value); setError(null); } }}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2 className="size-4" />{t("revokeInvitation")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("revokeInvitation")}</DialogTitle>
          <DialogDescription>{t("revokeDescription")}</DialogDescription>
        </DialogHeader>
        <p className="break-all text-sm">{email}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>{common("cancel")}</Button>
          <Button variant="destructive" disabled={pending} onClick={remove}>{t(pending ? "revokingInvitation" : "confirmRevoke")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
