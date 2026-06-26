import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../config.js";
import * as schema from "./schema.js";
import { mkdirSync } from "fs";
import { dirname } from "path";

mkdirSync(dirname(config.databasePath), { recursive: true });

const sqlite: Database.Database = new Database(config.databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite };
