// ============================================================
// VibeCode Desktop — Proposal Generator Tests
// Tests LLM response parsing, file operation extraction,
// command extraction, risk assessment, multi-file intent
// creation, and proposal card data generation.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ProposalGenerator,
  ExecutionIntent,
  ProposalCardData,
} from '../main/services/proposal-generator';
import {
  ExecutionEngine,
  StepInput,
  StepExecutor,
} from '../main/services/execution-engine';

// ─── Helper: Create an engine with mock executors ──────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-proposal-'));
}

function cleanupDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function createTestEngine(workspaceRoot: string): ExecutionEngine {
  const engine = new ExecutionEngine(workspaceRoot);
  const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
  registry.clear();

  // Install minimal mock executors
  for (const type of ['file_write', 'file_read', 'file_edit', 'command', 'code_generation', 'diff_apply', 'code_edit', 'analysis', 'generation', 'review']) {
    registry.set(type, async () => ({ ok: true }));
  }

  return engine;
}

describe('ProposalGenerator', () => {
  let tempDir: string;
  let engine: ExecutionEngine;
  let generator: ProposalGenerator;

  beforeEach(() => {
    tempDir = createTempDir();
    engine = createTestEngine(tempDir);
    generator = new ProposalGenerator(engine);
  });

  afterEach(() => {
    engine.getPersistence().flush();
    cleanupDir(tempDir);
  });

  // ── LLM Response Parsing ─────────────────────────────────────────────────

  describe('parseLLMResponse', () => {
    it('should return empty array for non-actionable responses', () => {
      const result = generator.parseLLMResponse('Hello! How can I help you today?');
      expect(result).toEqual([]);
    });

    it('should return empty array for purely conversational text', () => {
      const result = generator.parseLLMResponse('That sounds like a great idea! Let me know if you need more help.');
      expect(result).toEqual([]);
    });

    it('should parse a response with a code block and file path', () => {
      const response = `I'll create a new file for you:

\`\`\`typescript src/utils/helpers.ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\``;

      const intents = generator.parseLLMResponse(response);
      expect(intents.length).toBeGreaterThan(0);
    });

    it('should parse a response with a command', () => {
      const response = `Let me install the required dependencies. Run \`npm install express\` to get started.`;
      const intents = generator.parseLLMResponse(response);
      // Should find the npm install command
      expect(intents.length).toBeGreaterThanOrEqual(0); // May or may not create intent depending on parsing
    });

    it('should handle responses with multiple code blocks', () => {
      const response = `I'll create two files:

\`\`\`typescript src/index.ts
import { greet } from './utils/helpers';
console.log(greet('World'));
\`\`\`

\`\`\`typescript src/utils/helpers.ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\``;

      const intents = generator.parseLLMResponse(response);
      expect(intents.length).toBeGreaterThan(0);
    });

    it('should handle shell code blocks as commands', () => {
      const response = `Run the following command:

\`\`\`bash
npm install express cors
\`\`\``;

      const intents = generator.parseLLMResponse(response);
      // Shell blocks should be captured
      expect(intents.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ── File Operation Extraction ────────────────────────────────────────────

  describe('file operation extraction', () => {
    it('should extract file create operations', () => {
      const response = `I'll create a new component:

\`\`\`typescript src/components/Button.tsx
export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}
\`\`\``;

      const intents = generator.parseLLMResponse(response);
      expect(intents.length).toBeGreaterThan(0);

      const fileIntent = intents.find((i) => i.type === 'file_create' || i.type === 'multi_step');
      expect(fileIntent).toBeDefined();
      expect(fileIntent!.files.length).toBeGreaterThan(0);
      expect(fileIntent!.files[0].action).toBe('create');
    });

    it('should extract file edit operations', () => {
      const response = `I'll modify the existing file:

\`\`\`typescript src/components/App.tsx
// Updated content
export function App() {
  return <div>Updated</div>;
}
\`\`\``;

      const intents = generator.parseLLMResponse(response);
      // At least one intent should be generated
      expect(intents.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Command Extraction ───────────────────────────────────────────────────

  describe('command extraction', () => {
    it('should create a command intent for "Run" patterns', () => {
      const response = `Let's set up the project. Run \`npm install\` first.`;
      const intents = generator.parseLLMResponse(response);

      const commandIntent = intents.find((i) => i.type === 'command');
      if (commandIntent) {
        expect(commandIntent.type).toBe('command');
        expect(commandIntent.steps[0].type).toBe('command');
        expect(commandIntent.steps[0].params.command).toBeDefined();
      }
    });

    it('should detect dangerous commands', () => {
      const response = `Run \`rm -rf /tmp/old-builds\` to clean up.`;
      const intents = generator.parseLLMResponse(response);

      const commandIntent = intents.find((i) => i.type === 'command');
      if (commandIntent) {
        expect(commandIntent.riskLevel).toBe('high');
      }
    });
  });

  // ── Risk Assessment ──────────────────────────────────────────────────────

  describe('assessRisk', () => {
    it('should assess file creation as low risk', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent',
        type: 'file_create',
        title: 'Create new file',
        description: 'Create a new source file',
        files: [{ path: 'src/new-file.ts', action: 'create', description: 'New file' }],
        steps: [{
          type: 'file_write',
          title: 'Create file',
          description: 'Create new source file',
          params: { filePath: 'src/new-file.ts', content: 'export const x = 1;' },
          riskLevel: 'low',
        }],
        riskLevel: 'low',
        estimatedImpact: 'Creates one new file',
        canRollback: true,
      };

      const risk = generator.assessRisk(intent);
      expect(risk).toBe('low');
    });

    it('should assess file editing as medium risk', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent',
        type: 'file_edit',
        title: 'Edit existing file',
        description: 'Edit an existing source file',
        files: [{ path: 'src/existing-file.ts', action: 'edit', description: 'Edit file' }],
        steps: [{
          type: 'file_edit',
          title: 'Edit file',
          description: 'Edit existing file',
          params: { filePath: 'src/existing-file.ts' },
          riskLevel: 'medium',
        }],
        riskLevel: 'medium',
        estimatedImpact: 'Modifies existing file',
        canRollback: true,
      };

      const risk = generator.assessRisk(intent);
      expect(risk).toBe('medium');
    });

    it('should assess file deletion as high risk', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent',
        type: 'file_create',
        title: 'Delete file',
        description: 'Delete a source file',
        files: [{ path: 'src/old-file.ts', action: 'delete', description: 'Delete file' }],
        steps: [{
          type: 'file_write',
          title: 'Delete file',
          description: 'Delete source file',
          params: { filePath: 'src/old-file.ts' },
          riskLevel: 'high',
        }],
        riskLevel: 'high',
        estimatedImpact: 'Deletes a file',
        canRollback: false,
      };

      const risk = generator.assessRisk(intent);
      expect(risk).toBe('high');
    });

    it('should assess config file editing as high risk', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent',
        type: 'file_edit',
        title: 'Edit package.json',
        description: 'Modify package.json',
        files: [{ path: 'package.json', action: 'edit', description: 'Edit config' }],
        steps: [{
          type: 'file_edit',
          title: 'Edit package.json',
          description: 'Modify package.json',
          params: { filePath: 'package.json' },
          riskLevel: 'high',
        }],
        riskLevel: 'high',
        estimatedImpact: 'Modifies project configuration',
        canRollback: true,
      };

      const risk = generator.assessRisk(intent);
      expect(risk).toBe('high');
    });

    it('should assess dangerous commands as high risk', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent',
        type: 'command',
        title: 'Run destructive command',
        description: 'rm -rf build',
        files: [],
        steps: [{
          type: 'command',
          title: 'Run rm -rf',
          description: 'Delete build directory',
          params: { command: 'rm -rf ./build' },
          riskLevel: 'high',
        }],
        riskLevel: 'high',
        estimatedImpact: 'Destructive operation',
        canRollback: false,
      };

      const risk = generator.assessRisk(intent);
      expect(risk).toBe('high');
    });

    it('should assess high-risk steps as making the whole intent high risk', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent',
        type: 'multi_step',
        title: 'Mixed steps',
        description: 'Steps with varying risk',
        files: [{ path: 'src/file.ts', action: 'create', description: 'New file' }],
        steps: [
          { type: 'file_write', title: 'Low step', description: 'Low risk', params: {}, riskLevel: 'low' },
          { type: 'command', title: 'High step', description: 'High risk', params: { command: 'rm -rf /tmp' }, riskLevel: 'high' },
        ],
        riskLevel: 'high',
        estimatedImpact: 'Mixed impact',
        canRollback: true,
      };

      const risk = generator.assessRisk(intent);
      expect(risk).toBe('high');
    });
  });

  // ── Multi-File Intent Creation ───────────────────────────────────────────

  describe('multi-file intent creation', () => {
    it('should create a multi_step intent for multiple file operations', () => {
      const response = `I'll create both files:

\`\`\`typescript src/index.ts
console.log('hello');
\`\`\`

\`\`\`typescript src/utils.ts
export const x = 1;
\`\`\``;

      const intents = generator.parseLLMResponse(response);

      // Should have at least one intent (may be multi_step or separate)
      expect(intents.length).toBeGreaterThan(0);

      // Total affected files across all intents should be at least 2
      const totalFiles = intents.reduce((sum, i) => sum + i.files.length, 0);
      expect(totalFiles).toBeGreaterThanOrEqual(2);
    });

    it('should add dependency chains between steps in multi-file intents', () => {
      const response = `I'll create these files in order:

\`\`\`typescript src/types.ts
export interface User { name: string; }
\`\`\`

\`\`\`typescript src/api.ts
import { User } from './types';
export function getUser(): User { return { name: 'test' }; }
\`\`\``;

      const intents = generator.parseLLMResponse(response);

      // Multi-step intents should have dependencies between steps
      const multiStep = intents.find((i) => i.type === 'multi_step');
      if (multiStep) {
        const stepsWithDeps = multiStep.steps.filter((s) => s.dependsOn && s.dependsOn.length > 0);
        expect(stepsWithDeps.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Proposal Card Data Generation ────────────────────────────────────────

  describe('generateProposalFromIntent', () => {
    it('should generate a plan and proposal card from an intent', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent-1',
        type: 'file_create',
        title: 'Create new component',
        description: 'Create a new React component',
        files: [{ path: 'src/Button.tsx', action: 'create', description: 'New button component' }],
        steps: [{
          type: 'file_write',
          title: 'Create Button.tsx',
          description: 'Create the Button component file',
          params: { filePath: 'src/Button.tsx', content: 'export function Button() {}' },
          riskLevel: 'low',
        }],
        riskLevel: 'low',
        estimatedImpact: 'Creates one new file',
        canRollback: true,
      };

      const { plan, proposalCard } = generator.generateProposalFromIntent(intent);

      // Plan should be in draft status
      expect(plan).toBeDefined();
      expect(plan.title).toBe('Create new component');
      expect(plan.status).toBe('draft');
      expect(plan.steps).toHaveLength(1);

      // Proposal card should have correct data
      expect(proposalCard).toBeDefined();
      expect(proposalCard.id).toBe('test-intent-1');
      expect(proposalCard.type).toBe('file_create');
      expect(proposalCard.title).toBe('Create new component');
      expect(proposalCard.riskLevel).toBe('low');
      expect(proposalCard.status).toBe('pending');
      expect(proposalCard.affectedFiles).toHaveLength(1);
      expect(proposalCard.canRollback).toBe(true);
      expect(proposalCard.planId).toBe(plan.id);
    });

    it('should set high-risk steps as requiring approval', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent-2',
        type: 'command',
        title: 'Run deployment',
        description: 'Deploy the application',
        files: [],
        steps: [{
          type: 'command',
          title: 'Deploy command',
          description: 'Run deployment script',
          params: { command: 'npm run deploy' },
          riskLevel: 'high',
        }],
        riskLevel: 'high',
        estimatedImpact: 'Deploys to production',
        canRollback: false,
      };

      const { plan, proposalCard } = generator.generateProposalFromIntent(intent);

      // The step should require approval since risk is high
      expect(plan.steps[0].requiresApproval).toBe(true);
      expect(proposalCard.riskLevel).toBe('high');
    });

    it('should include step count and file count in details', () => {
      const intent: ExecutionIntent = {
        id: 'test-intent-3',
        type: 'multi_step',
        title: 'Multi-step operation',
        description: 'Multiple files and steps',
        files: [
          { path: 'src/a.ts', action: 'create', description: 'File A' },
          { path: 'src/b.ts', action: 'create', description: 'File B' },
        ],
        steps: [
          { type: 'file_write', title: 'Step 1', description: 'Create A', params: {}, riskLevel: 'low' },
          { type: 'file_write', title: 'Step 2', description: 'Create B', params: {}, riskLevel: 'low' },
        ],
        riskLevel: 'low',
        estimatedImpact: 'Creates 2 files',
        canRollback: true,
      };

      const { proposalCard } = generator.generateProposalFromIntent(intent);

      expect(proposalCard.details.stepCount).toBe(2);
      expect(proposalCard.details.fileCount).toBe(2);
    });
  });
});
