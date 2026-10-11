import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { liveSessionCodeSchema } from "@/modules/wiki/lib/live-session";
import { getLiveSessionByCode, getPresentation } from "@/modules/wiki/presentation-queries";
import { PresentationJoinForm } from "@/modules/wiki/components/presentation-live";
import { PresentationPlayer } from "@/modules/wiki/components/presentation-player";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

/**
 * Read-only follow view. `requireUser` first: a join code is a convenience for people who
 * already have an account here, never a way past sign-in.
 */
export default async function FollowLiveSessionPage({ params }: { params: Promise<{ code: string }> }) {
  const [viewer, { code }] = await Promise.all([requireUser(), params]);
  const parsed = liveSessionCodeSchema.safeParse(code);
  const session = parsed.success ? getLiveSessionByCode(parsed.data) : null;

  if (!session || !session.live) {
    const t = await getTranslations("wiki");
    return (
      <div className={WIKI_PAGE_CLASS}>
        <div className="mx-auto max-w-md rounded-xl border bg-card px-6 py-8 text-center shadow-card">
          <h1 className="text-[14.5px] font-semibold">{t("presentations.followNotFound")}</h1>
          <p className="mt-1 mb-4 text-[13.5px] text-muted-foreground">{t("presentations.followNotFoundDescription")}</p>
          <div className="flex justify-center">
            <PresentationJoinForm />
          </div>
        </div>
      </div>
    );
  }

  const presentation = getPresentation(session.presentationId, viewer);
  if (!presentation) notFound();
  // Speaker notes are private to the author/presenter; don't serialize them to followers.
  const audiencePresentation = { ...presentation, steps: presentation.steps.map(({ id, elementId, durationMs, action, animationMs }) => ({ id, elementId, durationMs, action, animationMs })) };
  return <PresentationPlayer presentation={audiencePresentation} follow={{ code: session.code, hostName: session.hostName, hostUserId: session.hostUserId, stepIndex: session.stepIndex, live: session.live }} />;
}
