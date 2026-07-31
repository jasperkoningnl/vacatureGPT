import { migrate } from "drizzle-orm/neon-http/migrator"; import { getDb } from "../lib/db";
await migrate(getDb(), { migrationsFolder: "drizzle" }); console.log("Migraties toegepast.");
