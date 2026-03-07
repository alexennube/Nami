import { randomUUID } from "crypto";
import type { AuditAction, AuditRecordType, AuditLogEntry } from "@shared/schema";
import { dbInsertAuditLog } from "./db-persist";

export interface AuditContext {
  actorType: "user" | "agent" | "system";
  actorName: string;
}

export const SYSTEM_ACTOR: AuditContext = { actorType: "system", actorName: "System" };
export const USER_ACTOR: AuditContext = { actorType: "user", actorName: "User" };
export const ENGINE_ACTOR: AuditContext = { actorType: "system", actorName: "Engine" };

export function actorFromName(name?: string | null): AuditContext {
  if (!name || name === "System" || name === "Engine") return { actorType: "system", actorName: name || "System" };
  if (name === "User") return USER_ACTOR;
  return { actorType: "agent", actorName: name };
}

export async function logAudit(
  action: AuditAction,
  recordType: AuditRecordType,
  recordId: string,
  recordName: string,
  actor: AuditContext,
  summary: string,
): Promise<void> {
  try {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      recordType,
      recordId,
      recordName,
      actorType: actor.actorType,
      actorName: actor.actorName,
      summary,
    };
    await dbInsertAuditLog(entry);
  } catch (e: any) {
    console.error(`[audit] Failed to log: ${e.message}`);
  }
}
