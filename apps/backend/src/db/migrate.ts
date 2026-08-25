import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { db, sqlite } from "./connection.js";

const MIGRATIONS_FOLDER = "./src/db/migrations";

type Journal = { entries: { idx: number; tag: string; when: number }[] };

/**
 * 应用首次启动时 initDatabase() 会用 CREATE TABLE IF NOT EXISTS 一次性建出全量表，
 * 这样的库里没有 __drizzle_migrations 记录，直接跑迁移会撞上 "table already exists"。
 *
 * 这里做一次基线登记：库里已有业务表但没有迁移记录时，把初始迁移（idx 0）标记为已应用，
 * 后续迁移照常执行。
 */
function baselineLegacyDatabase(): boolean {
  const tableExists = (name: string) =>
    (
      sqlite
        .prepare(
          "SELECT count(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(name) as { c: number }
    ).c > 0;

  // 全新库，什么都不用做，交给 drizzle 正常迁移
  if (!tableExists("transactions")) return false;
  // 已经在迁移体系里了
  if (tableExists("__drizzle_migrations")) return false;

  const journalPath = join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  if (!existsSync(journalPath)) return false;

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
  const initial = journal.entries.find((entry) => entry.idx === 0);
  if (!initial) return false;

  const sql = readFileSync(join(MIGRATIONS_FOLDER, `${initial.tag}.sql`), "utf8");

  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`,
  );
  sqlite
    .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)')
    .run(createHash("sha256").update(sql).digest("hex"), initial.when);

  return true;
}

if (baselineLegacyDatabase()) {
  console.log(
    "检测到应用启动时已建好的数据库，已将初始迁移登记为基线，跳过重复建表",
  );
}

migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
console.log("Migration complete");
