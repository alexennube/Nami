import { z } from "zod";

export const crmAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  size: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().default(null),
  lastModifiedBy: z.string().nullable().default(null),
});
export type CrmAccount = z.infer<typeof crmAccountSchema>;

export const contactIntelligenceSchema = z.object({
  analyzedAt: z.string(),
  recommendedChannels: z.array(z.string()),
  messagingApproach: z.string(),
  onlineFootprint: z.string(),
  painPoints: z.array(z.string()),
  outreachTiming: z.string(),
  talkingPoints: z.array(z.string()),
  summary: z.string(),
});
export type ContactIntelligence = z.infer<typeof contactIntelligenceSchema>;

export const crmContactSchema = z.object({
  id: z.string(),
  accountId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  linkedIn: z.string().optional(),
  twitter: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  stage: z.enum(["lead", "prospect", "qualified", "customer", "churned"]).optional(),
  sequenceId: z.string().optional(),
  sequenceStep: z.number().optional(),
  sequenceStatus: z.enum(["active", "paused", "completed"]).optional(),
  lastStepCompletedAt: z.string().optional(),
  sequenceMetadata: z.record(z.any()).optional(),
  contactIntelligence: contactIntelligenceSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().default(null),
  lastModifiedBy: z.string().nullable().default(null),
});
export type CrmContact = z.infer<typeof crmContactSchema>;

export const crmContactCommentSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  author: z.string(),
  authorType: z.enum(["user", "agent", "queen"]),
  content: z.string(),
  createdAt: z.string(),
});
export type CrmContactComment = z.infer<typeof crmContactCommentSchema>;

export const crmActivitySchema = z.object({
  id: z.string(),
  contactId: z.string(),
  type: z.enum(["email_sent", "email_received", "profile_visit", "note", "call", "meeting", "research", "sequence_step", "engagement", "other"]),
  title: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  agentName: z.string().optional(),
  createdAt: z.string(),
});
export type CrmActivity = z.infer<typeof crmActivitySchema>;

export const sequenceStepSchema = z.object({
  id: z.string(),
  order: z.number(),
  type: z.enum(["email", "phone_call", "linkedin", "social_media", "research", "wait", "task"]),
  subject: z.string().optional(),
  content: z.string().optional(),
  delayDays: z.number().optional(),
  instruction: z.string().optional(),
});
export type SequenceStep = z.infer<typeof sequenceStepSchema>;

export const crmSequenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "draft"]),
  sequenceType: z.enum(["contact", "account"]).optional(),
  accountId: z.string().optional(),
  roleTargeting: z.record(z.string(), z.string()).optional(),
  steps: z.array(sequenceStepSchema),
  contactIds: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().default(null),
  lastModifiedBy: z.string().nullable().default(null),
});
export type CrmSequence = z.infer<typeof crmSequenceSchema>;
