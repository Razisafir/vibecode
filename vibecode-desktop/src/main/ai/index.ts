// ============================================================
// VibeCode Desktop — ARC 22: AI Agent System — Barrel Export
// ============================================================

// Core Types
export * from './types';

// Communication
export { AgentCommunicationBus } from './agent-communication-bus';
export type { BusEventType, BusEvent, BusEventHandler } from './agent-communication-bus';

// Shared Context
export { SharedContextGraph } from './shared-context-graph';
export type { ContextGraphEventType, ContextGraphEvent } from './shared-context-graph';

// Voting
export { AgentVotingEngine } from './agent-voting-engine';
export type { VotingEventType, VotingEvent } from './agent-voting-engine';

// Parallel Execution
export { ParallelExecutionEngine } from './parallel-execution-engine';
export type { ParallelEventType, ParallelEvent } from './parallel-execution-engine';

// Orchestrator
export { MultiAgentOrchestrator } from './multi-agent-orchestrator';
export type { OrchestratorEventType, OrchestratorEvent } from './multi-agent-orchestrator';

// Autonomous Organization
export { AutonomousOrganization } from './autonomous-organization';
export type { OrganizationEventType, OrganizationEvent } from './autonomous-organization';

// Base Agent
export { BaseAgent } from './agents/base-agent';
export type { AgentEventType, AgentEvent } from './agents/base-agent';
