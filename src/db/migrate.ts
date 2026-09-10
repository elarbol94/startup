import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

export async function runMigrations() {
  // The app loads .env.local through Next.js; do the same for standalone
  // migrations so they always target the database used by the running app.
  loadEnvConfig(process.cwd(), true);
  const { db, sqlite } = await import("./index");
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const { getTableName, is, Table } = await import("drizzle-orm");
  const schema = await import("./schema");
  const { installVersionJournal } = await import("@/modules/settings/version-control/journal");
  installVersionJournal(sqlite, Object.values(schema).filter(value => is(value, Table)).map(value => getTableName(value)));
}

// Run directly via `npm run db:migrate`
if (process.argv[1] && path.basename(process.argv[1]).startsWith("migrate")) {
  void runMigrations().then(() => {
    console.log("Migrations applied.");
  });
}
