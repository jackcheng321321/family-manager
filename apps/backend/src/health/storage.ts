// 健康模块文件存储：体检 PDF、就诊图片统一存放在 config.healthFilesDir 下，
// 该目录位于已挂载的 data 卷内，重建容器不丢文件。DB 中只保存相对路径，
// 读取时再拼回绝对路径，并做越界校验，避免路径穿越。

import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { dirname, extname, join, resolve, relative, isAbsolute } from "path";
import { nanoid } from "nanoid";
import { config } from "../config.js";

const ROOT = resolve(config.healthFilesDir);

/** 允许的扩展名（兜底白名单），其余一律存为 .bin */
const ALLOWED_EXT = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".bmp",
]);

function safeExt(originalName: string | undefined, fallback = ".bin"): string {
  const ext = (originalName ? extname(originalName) : "").toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : fallback;
}

/**
 * 保存一个 buffer 到 `<subdir>/<随机名><ext>`，返回相对 ROOT 的存储路径（用于入库）。
 * subdir 形如 "checkups/<checkupId>" 或 "visits/<visitId>"。
 */
export function saveBuffer(
  subdir: string,
  buffer: Buffer,
  originalName?: string
): string {
  const ext = safeExt(originalName);
  const fileName = `${nanoid()}${ext}`;
  const relPath = join(subdir, fileName);
  const absPath = join(ROOT, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, buffer);
  return relPath;
}

/** 把入库的相对路径还原为绝对路径，越界返回 null。 */
export function resolveStoredPath(relPath: string): string | null {
  if (!relPath) return null;
  const abs = resolve(ROOT, relPath);
  const rel = relative(ROOT, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  if (!existsSync(abs)) return null;
  return abs;
}

/** 删除一个已存储文件（忽略不存在）。 */
export function deleteStoredFile(relPath: string | null | undefined): void {
  if (!relPath) return;
  const abs = resolve(ROOT, relPath);
  const rel = relative(ROOT, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return;
  try {
    if (existsSync(abs)) unlinkSync(abs);
  } catch {
    // 删除失败不阻塞主流程
  }
}

/** 根据扩展名/原始名猜测 MIME，用于下载响应头与 VL 模型 data URL。 */
export function guessMimeType(nameOrPath: string): string {
  const ext = extname(nameOrPath).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}

export function isImageName(nameOrPath: string): boolean {
  return guessMimeType(nameOrPath).startsWith("image/");
}
