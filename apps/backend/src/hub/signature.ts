import { createHmac, timingSafeEqual } from "crypto";

function normalizeSignature(signature: string): string | null {
  const value = signature.trim().replace(/^sha256=/i, "");
  return /^[a-fA-F0-9]+$/.test(value) ? value : null;
}

function verifyPayload(payload: string, signatureHex: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signatureHex, "hex");

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp?: string
): boolean {
  const signatureHex = normalizeSignature(signature);
  if (!signatureHex) {
    return false;
  }

  if (timestamp && verifyPayload(`${timestamp}:${payload}`, signatureHex, secret)) {
    return true;
  }

  return verifyPayload(payload, signatureHex, secret);
}
