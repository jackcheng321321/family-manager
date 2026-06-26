// Downloads media (image/voice) served by the OpeniLink Hub and returns it as a
// base64 data URL. The Hub media URL is a private NAS address with a one-time
// AES token, so Alibaba's DashScope servers cannot fetch it directly — we must
// download it here and pass the bytes to the model inline.

const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10MB, DashScope inline limit

/**
 * Fetch a Hub media URL and return a `data:<mime>;base64,<...>` string.
 * The Hub media endpoint requires `Authorization: Bearer <app_token>` (the same
 * token used to send bot messages) — the URL signature alone returns 401.
 * The mime type is taken from the URL's `ct` query param first (Hub encodes it
 * there, e.g. `ct=image%2Fjpeg`), falling back to the response Content-Type.
 */
export async function downloadMediaAsDataUrl(url: string, appToken?: string): Promise<string> {
  const res = await fetch(url, {
    headers: appToken ? { Authorization: `Bearer ${appToken}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Failed to download media: HTTP ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    throw new Error("Downloaded media is empty");
  }
  if (buf.byteLength > MAX_MEDIA_BYTES) {
    throw new Error(`Media too large: ${buf.byteLength} bytes`);
  }

  let mime = "";
  try {
    mime = new URL(url).searchParams.get("ct") || "";
  } catch {
    // ignore malformed URL, fall back to header
  }
  if (!mime) {
    mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  }

  return `data:${mime};base64,${buf.toString("base64")}`;
}
