import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { wikiOfficeSessions } from "@/db/schema";
import { sendCommand } from "./command";
import { officeConfig } from "./config";

/**
 * Disconnects a removed user from every open office editing session. The
 * document server keeps its own connection, so this complements the session
 * deletion in the app. Best effort: failures are logged, never thrown.
 */
export async function dropUserFromOfficeSessions(userId: string) {
  const config = officeConfig();
  if (!config) return;
  const sessions = db.select({ key: wikiOfficeSessions.key, users: wikiOfficeSessions.connectedUserIdsJson })
    .from(wikiOfficeSessions).where(inArray(wikiOfficeSessions.state, ["open", "idle"])).all()
    .filter((session) => (JSON.parse(session.users) as string[]).includes(userId));
  await Promise.all(sessions.map((session) => sendCommand(config, { c: "drop", key: session.key, users: [userId] })
    .catch((error: unknown) => console.warn(JSON.stringify({ event: "office_drop_user_failed", key: session.key, reason: error instanceof Error ? error.message : String(error) })))));
}
