import { createHash, randomBytes } from "crypto";
import { db } from "../db/connection.js";
import { memberTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";

// 成员密钥格式：cw_ + 43 位 base64url 随机串（32 字节熵）。
// 库里只存哈希，明文丢了只能作废重新生成。
const TOKEN_PREFIX = "cw_";

export function generateMemberToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashMemberToken(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6),
  };
}

export function hashMemberToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Look up a token and stamp its last use. Returns null for unknown tokens. */
export function verifyMemberToken(token: string) {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const record = db
    .select()
    .from(memberTokens)
    .where(eq(memberTokens.tokenHash, hashMemberToken(token)))
    .get();
  if (!record) return null;
  db.update(memberTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(memberTokens.id, record.id))
    .run();
  return record;
}
