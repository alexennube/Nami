export { createCrmDb, type CrmDb } from "./server/db";
export { registerCrmRoutes, type CrmAuditFn, type CrmRouteDeps } from "./server/routes";
export { createCrmTool, type CrmToolAuditFn } from "./server/tool";
export { startSequenceEngine, stopSequenceEngine, createIntelligenceAnalyzer, type SequenceEngineDeps } from "./server/sequence-engine";
export * from "./shared/schema";
