import "server-only";

import { getFormatter } from "next-intl/server";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";
import { dateOnly } from "./components/network-ui";

/** Today's date as the viewer reads it ("28.09.2026"), for the "Merged from … on …" note. */
export async function mergeNoteDate() {
  const format = await getFormatter();
  return format.dateTime(dateOnly(localDateInZone(new Date(), TIME_ZONE)), { dateStyle: "medium", timeZone: "UTC" });
}
