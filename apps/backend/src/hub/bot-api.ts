import { db } from "../db/connection.js";
import { getHubUrl } from "../db/settings.js";
import { installations } from "../db/schema.js";
import { eq } from "drizzle-orm";

export async function sendBotMessage(
  installationId: string,
  recipientId: string,
  text: string,
  traceId?: string
) {
  const installation = db
    .select()
    .from(installations)
    .where(eq(installations.id, installationId))
    .get();

  if (!installation) {
    console.error(`Installation not found, cannot send message: ${installationId}`);
    return false;
  }

  return sendMessageViaApi(
    installation.appToken,
    recipientId,
    text,
    traceId
  );
}

async function sendMessageViaApi(
  appToken: string,
  recipientId: string,
  text: string,
  traceId?: string
) {
  try {
    const hubUrl = getHubUrl();
    if (!hubUrl) {
      console.error("Hub URL is empty, cannot send bot message");
      return false;
    }

    const response = await fetch(`${hubUrl}/bot/v1/message/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appToken}`,
      },
      body: JSON.stringify({
        type: "text",
        to: recipientId,
        content: text,
        trace_id: traceId,
      }),
    });
    if (!response.ok) {
      console.error("Failed to send bot message:", {
        status: response.status,
        body: await response.text(),
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending bot message:", error);
    return false;
  }
}

export async function sendBotMessageToAll(text: string) {
  // Send to all known WeChat members
  const { members } = await import("../db/schema.js");
  const allMembers = db.select().from(members).all();
  const installation = db.select().from(installations).limit(1).get();
  if (!installation) {
    console.error("No installation found, cannot broadcast monthly summary");
    return 0;
  }

  let successCount = 0;
  for (const member of allMembers) {
    if (member.wechatUserId) {
      const success = await sendMessageViaApi(
        installation.appToken,
        member.wechatUserId,
        text
      );
      if (success) {
        successCount += 1;
      }
    }
  }

  console.log(`Broadcast finished, ${successCount} member(s) received the message`);
  return successCount;
}
