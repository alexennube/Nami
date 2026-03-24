import crypto from "crypto";
import type { CrmDb } from "./db";

export interface SequenceEngineDeps {
  db: CrmDb;
  log: (msg: string, source: string) => void;
  executeToolCall: (name: string, args: Record<string, any>, ctx: { agentName: string; agentRole: string }) => Promise<string>;
  chatCompletion: (messages: any[], opts?: any) => Promise<{ content: string }>;
  runContactIntelligenceAnalysis: (contact: any) => Promise<any>;
}

const SEQUENCE_ENGINE_INTERVAL_MS = 60_000;
let sequenceEngineTimer: ReturnType<typeof setTimeout> | null = null;

export function startSequenceEngine(deps: SequenceEngineDeps) {
  stopSequenceEngine();
  deps.log("Sequence execution engine started", "sequence-engine");

  const tick = async () => {
    try {
      await checkActiveSequences(deps);
    } catch (err: any) {
      deps.log(`Sequence engine error: ${err.message}`, "sequence-engine");
    }
    sequenceEngineTimer = setTimeout(tick, SEQUENCE_ENGINE_INTERVAL_MS);
  };

  sequenceEngineTimer = setTimeout(tick, SEQUENCE_ENGINE_INTERVAL_MS);
}

export function stopSequenceEngine() {
  if (sequenceEngineTimer) {
    clearTimeout(sequenceEngineTimer);
    sequenceEngineTimer = null;
  }
}

async function checkActiveSequences(deps: SequenceEngineDeps) {
  const { db, log } = deps;
  const sequences = await db.getSequences();
  const activeSequences = sequences.filter((s: any) => s.status === "active");

  for (const seq of activeSequences) {
    if (!seq.contactIds || seq.contactIds.length === 0) continue;

    for (const cid of seq.contactIds) {
      try {
        const contact = await db.getContact(cid);
        if (!contact) continue;
        if (contact.sequenceStatus !== "active") continue;

        const currentStep = contact.sequenceStep || 0;
        if (currentStep >= seq.steps.length) {
          contact.sequenceStatus = "completed";
          contact.updatedAt = new Date().toISOString();
          await db.upsertContact(contact);
          continue;
        }

        const step = seq.steps[currentStep];
        const lastCompleted = contact.lastStepCompletedAt ? new Date(contact.lastStepCompletedAt).getTime() : 0;
        const now = Date.now();
        const delayMs = (step.delayDays || 0) * 24 * 60 * 60 * 1000;

        if (now - lastCompleted < delayMs) continue;

        const nextStep = currentStep + 1;
        if (nextStep >= seq.steps.length) {
          contact.sequenceStatus = "completed";
        } else {
          contact.sequenceStep = nextStep;
          contact.lastStepCompletedAt = new Date().toISOString();
        }
        contact.updatedAt = new Date().toISOString();
        await db.upsertContact(contact);

        const activity = {
          id: crypto.randomUUID(),
          contactId: cid,
          type: "sequence_step" as const,
          title: `Auto-advanced: ${step.type} (Step ${currentStep + 1})`,
          description: step.instruction || step.content || step.subject || `Sequence step ${currentStep + 1} completed`,
          metadata: { sequenceId: seq.id, stepId: step.id, stepType: step.type, autoAdvanced: true },
          agentName: "Sequence Engine",
          createdAt: new Date().toISOString(),
        };
        await db.addActivity(activity);

        log(`Auto-advanced contact ${contact.firstName} ${contact.lastName} to step ${nextStep + 1} in sequence "${seq.name}"`, "sequence-engine");

        await executeSequenceStepAction(step, contact, seq, deps);
      } catch (err: any) {
        log(`Sequence engine error for contact ${cid}: ${err.message}`, "sequence-engine");
      }
    }
  }
}

async function executeSequenceStepAction(step: any, contact: any, seq: any, deps: SequenceEngineDeps) {
  const { db, log, executeToolCall } = deps;
  try {
    const contactName = `${contact.firstName} ${contact.lastName}`;

    if (step.type === "email" && step.subject && step.content) {
      log(`Queuing email action for ${contactName}: "${step.subject}"`, "sequence-engine");
      if (contact.email) {
        const emailResult = await executeToolCall("google_workspace", {
          action: "gmail_send",
          to: contact.email,
          subject: step.subject,
          body: step.content,
        }, { agentName: "Sequence Engine", agentRole: "spawn" });
        log(`Email tool result for ${contactName}: ${emailResult.substring(0, 200)}`, "sequence-engine");

        await db.addActivity({
          id: crypto.randomUUID(),
          contactId: contact.id,
          type: "email_sent" as const,
          title: `Email sent: ${step.subject}`,
          description: `Automated email sent via sequence "${seq.name}"`,
          metadata: { sequenceId: seq.id, stepType: "email", automated: true },
          agentName: "Sequence Engine",
          createdAt: new Date().toISOString(),
        });
      }
    } else if (step.type === "research") {
      log(`Queuing research action for ${contactName}`, "sequence-engine");
      const query = step.instruction || `${contactName}${contact.company ? ` ${contact.company}` : ""} professional background`;
      const searchResult = await executeToolCall("web_search", { query, detailed: true }, { agentName: "Sequence Engine", agentRole: "spawn" });

      await db.addActivity({
        id: crypto.randomUUID(),
        contactId: contact.id,
        type: "research" as const,
        title: `Research completed: ${contactName}`,
        description: searchResult ? searchResult.substring(0, 500) : "Research completed",
        metadata: { sequenceId: seq.id, stepType: "research", automated: true },
        agentName: "Sequence Engine",
        createdAt: new Date().toISOString(),
      });

      if (contact.linkedIn) {
        try {
          await executeToolCall("web_browse", { url: contact.linkedIn }, { agentName: "Sequence Engine", agentRole: "spawn" });
        } catch {}
      }
    } else if (step.type === "linkedin" && step.instruction) {
      log(`LinkedIn step for ${contactName}: ${step.instruction.substring(0, 100)}`, "sequence-engine");
      await db.addActivity({
        id: crypto.randomUUID(),
        contactId: contact.id,
        type: "engagement" as const,
        title: `LinkedIn engagement: ${contactName}`,
        description: step.instruction,
        metadata: { sequenceId: seq.id, stepType: "linkedin", automated: true },
        agentName: "Sequence Engine",
        createdAt: new Date().toISOString(),
      });
    } else if (step.type === "phone_call" && step.instruction) {
      log(`Phone call step for ${contactName}: ${step.instruction.substring(0, 100)}`, "sequence-engine");
      await db.addActivity({
        id: crypto.randomUUID(),
        contactId: contact.id,
        type: "call" as const,
        title: `Call scheduled: ${contactName}`,
        description: step.instruction,
        metadata: { sequenceId: seq.id, stepType: "phone_call", automated: true },
        agentName: "Sequence Engine",
        createdAt: new Date().toISOString(),
      });
    } else if (step.type === "task" && step.instruction) {
      log(`Task step for ${contactName}: ${step.instruction.substring(0, 100)}`, "sequence-engine");
      await db.addActivity({
        id: crypto.randomUUID(),
        contactId: contact.id,
        type: "other" as const,
        title: `Task: ${step.instruction.substring(0, 80)}`,
        description: step.instruction,
        metadata: { sequenceId: seq.id, stepType: "task", automated: true },
        agentName: "Sequence Engine",
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    log(`Step action execution failed for ${step.type}: ${err.message}`, "sequence-engine");
  }
}

export function createIntelligenceAnalyzer(deps: { log: (msg: string, source: string) => void; executeToolCall: (name: string, args: Record<string, any>, ctx: { agentName: string; agentRole: string }) => Promise<string>; chatCompletion: (messages: any[], opts?: any) => Promise<{ content: string }> }) {
  const { log, executeToolCall, chatCompletion } = deps;

  return async function runContactIntelligenceAnalysis(contact: any): Promise<any> {
    const contactInfo = [
      `Name: ${contact.firstName} ${contact.lastName}`,
      contact.title ? `Title: ${contact.title}` : null,
      contact.company ? `Company: ${contact.company}` : null,
      contact.email ? `Email: ${contact.email}` : null,
      contact.phone ? `Phone: ${contact.phone}` : null,
      contact.linkedIn ? `LinkedIn: ${contact.linkedIn}` : null,
      contact.twitter ? `Twitter/X: ${contact.twitter}` : null,
      contact.website ? `Website: ${contact.website}` : null,
      contact.industry ? `Industry: ${contact.industry}` : null,
      contact.stage ? `CRM Stage: ${contact.stage}` : null,
      contact.notes ? `Notes: ${contact.notes}` : null,
    ].filter(Boolean).join("\n");

    let researchData = "";
    try {
      const searchQuery = `${contact.firstName} ${contact.lastName}${contact.company ? ` ${contact.company}` : ""}${contact.title ? ` ${contact.title}` : ""}`;
      log(`Running web research for contact: ${searchQuery}`, "sequence-engine");
      const searchResult = await executeToolCall("web_search", { query: searchQuery, detailed: true }, { agentName: "Sequence Intelligence", agentRole: "spawn" });
      if (searchResult && !searchResult.startsWith("Error")) {
        researchData += `\n\n--- Web Search Results ---\n${searchResult.substring(0, 3000)}`;
      }
    } catch (err: any) {
      log(`Web search failed for intelligence: ${err.message}`, "sequence-engine");
    }

    try {
      if (contact.linkedIn) {
        log(`Browsing LinkedIn for contact: ${contact.linkedIn}`, "sequence-engine");
        const browseResult = await executeToolCall("web_browse", { url: contact.linkedIn }, { agentName: "Sequence Intelligence", agentRole: "spawn" });
        if (browseResult && !browseResult.startsWith("Error")) {
          researchData += `\n\n--- LinkedIn Profile ---\n${browseResult.substring(0, 2000)}`;
        }
      }
    } catch (err: any) {
      log(`Web browse failed for intelligence: ${err.message}`, "sequence-engine");
    }

    try {
      if (contact.website) {
        const browseResult = await executeToolCall("web_browse", { url: contact.website }, { agentName: "Sequence Intelligence", agentRole: "spawn" });
        if (browseResult && !browseResult.startsWith("Error")) {
          researchData += `\n\n--- Website ---\n${browseResult.substring(0, 1500)}`;
        }
      }
    } catch (err: any) {
      log(`Website browse failed for intelligence: ${err.message}`, "sequence-engine");
    }

    const prompt = `You are a competitive intelligence analyst for a sales engagement platform. Analyze the following contact and produce a structured intelligence report for sales outreach.

Contact Information:
${contactInfo}
${researchData ? `\nResearch Data (gathered from web search and browsing):\n${researchData}` : "\n(No external research data available — analyze based on contact information only.)"}

Produce a JSON response with exactly these fields:
{
  "recommendedChannels": ["array of best communication channels for this person, e.g. Email, LinkedIn, Phone, Twitter/X"],
  "messagingApproach": "string describing the recommended messaging tone, style, and strategy for this person's seniority and role",
  "onlineFootprint": "string summarizing their online presence, professional activity, and digital footprint based on research data",
  "painPoints": ["array of 3-5 likely business pain points based on their role, title, industry, and research"],
  "outreachTiming": "string with recommended days and times for outreach based on their role type",
  "talkingPoints": ["array of 4-6 personalized talking points and conversation starters informed by research"],
  "summary": "string with a brief executive summary of the intelligence analysis"
}

Respond ONLY with valid JSON, no markdown formatting or extra text.`;

    try {
      const result = await chatCompletion(
        [
          { role: "system", content: "You are a sales intelligence analyst. Respond only with valid JSON." },
          { role: "user", content: prompt },
        ],
        { useTools: false, maxTokens: 2000 }
      );

      const content = result.content.trim();
      const jsonStr = content.startsWith("{") ? content : content.match(/\{[\s\S]*\}/)?.[0] || "";
      const parsed = JSON.parse(jsonStr);
      return {
        analyzedAt: new Date().toISOString(),
        recommendedChannels: parsed.recommendedChannels || ["Email"],
        messagingApproach: parsed.messagingApproach || "",
        onlineFootprint: parsed.onlineFootprint || "",
        painPoints: parsed.painPoints || [],
        outreachTiming: parsed.outreachTiming || "",
        talkingPoints: parsed.talkingPoints || [],
        summary: parsed.summary || "",
      };
    } catch (err: any) {
      log(`AI intelligence analysis failed, using heuristic fallback: ${err.message}`, "sequence-engine");
      return {
        analyzedAt: new Date().toISOString(),
        recommendedChannels: inferChannelsFallback(contact),
        messagingApproach: inferApproachFallback(contact),
        onlineFootprint: buildFootprintFallback(contact),
        painPoints: inferPainPointsFallback(contact),
        outreachTiming: "Mid-week (Tuesday-Thursday), morning hours 9-11 AM in contact's timezone.",
        talkingPoints: inferTalkingPointsFallback(contact),
        summary: `Intelligence report for ${contact.firstName} ${contact.lastName}${contact.title ? `, ${contact.title}` : ""}${contact.company ? ` at ${contact.company}` : ""}. Generated from heuristic analysis.`,
      };
    }
  };
}

function inferChannelsFallback(contact: any): string[] {
  const channels: string[] = [];
  if (contact.email) channels.push("Email");
  if (contact.linkedIn) channels.push("LinkedIn");
  if (contact.twitter) channels.push("Twitter/X");
  if (contact.phone) channels.push("Phone");
  if (channels.length === 0) channels.push("Email", "LinkedIn");
  return channels;
}

function inferApproachFallback(contact: any): string {
  const title = (contact.title || "").toLowerCase();
  if (title.includes("ceo") || title.includes("cto") || title.includes("cfo") || title.includes("chief") || title.includes("vp") || title.includes("president")) {
    return "Executive-level: Lead with ROI, strategic impact, and high-level outcomes.";
  }
  if (title.includes("director") || title.includes("head") || title.includes("manager")) {
    return "Management-level: Focus on team productivity gains and operational efficiency.";
  }
  if (title.includes("engineer") || title.includes("developer") || title.includes("architect")) {
    return "Technical: Lead with technical capabilities, integration options, and developer experience.";
  }
  return "Professional: Balanced approach combining value proposition with practical benefits.";
}

function buildFootprintFallback(contact: any): string {
  const parts: string[] = [];
  if (contact.linkedIn) parts.push(`LinkedIn: ${contact.linkedIn}`);
  if (contact.twitter) parts.push(`Twitter/X: ${contact.twitter}`);
  if (contact.website) parts.push(`Website: ${contact.website}`);
  if (contact.company) parts.push(`Company: ${contact.company}`);
  if (parts.length === 0) return "Limited online presence detected.";
  return parts.join(". ") + ".";
}

function inferPainPointsFallback(contact: any): string[] {
  const title = (contact.title || "").toLowerCase();
  if (title.includes("sales") || title.includes("revenue")) return ["Pipeline velocity", "Lead quality", "Sales productivity"];
  if (title.includes("marketing") || title.includes("growth")) return ["Lead generation", "Campaign ROI", "Customer acquisition costs"];
  if (title.includes("engineer") || title.includes("developer")) return ["Development velocity", "System reliability", "Technical debt"];
  if (title.includes("ceo") || title.includes("founder")) return ["Revenue growth", "Operational efficiency", "Competitive differentiation"];
  return ["Workflow efficiency", "Cross-team collaboration", "Process optimization"];
}

function inferTalkingPointsFallback(contact: any): string[] {
  const points: string[] = [];
  if (contact.company) points.push(`Reference their work at ${contact.company}`);
  if (contact.title) points.push(`Tailor messaging to their ${contact.title} role`);
  if (contact.industry) points.push(`Discuss ${contact.industry} industry trends`);
  points.push("Share relevant case studies from similar organizations");
  return points;
}
