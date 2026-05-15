import * as fs from 'fs';
import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';
import { validateWorkspacePath } from './file-write-executor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CodeGenerationParams {
  filePath: string;       // Relative to workspace root
  content: string;        // The code content to write
  encoding?: BufferEncoding;
  createDirs?: boolean;
  // 'prompt' is reserved for future LLM integration; currently requires 'content'
  prompt?: string;
}

export interface CodeGenerationResult {
  filePath: string;
  linesGenerated: number;
  bytesWritten: number;
}

// ─── Allowed file extensions for code generation ─────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.rs', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.html', '.css', '.scss', '.less', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.sh', '.bash', '.sql',
  '.graphql', '.gql', '.prisma',
  '.proto', '.dockerfile',
]);

// ─── Code Generation Executor ─────────────────────────────────────────────────

export const createCodeGenerationExecutor = (workspaceRoot: string): StepExecutor => {
  return async (step: ExecutionStep): Promise<CodeGenerationResult> => {
    const params = step.params as unknown as CodeGenerationParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('code_generation executor: "filePath" is required and must be a string');
    }

    // Support 'content' directly, or error if only 'prompt' is provided
    if (!params.content || typeof params.content !== 'string') {
      if (params.prompt) {
        throw new Error(
          'code_generation executor: LLM-based generation via "prompt" is not yet supported. ' +
          'Please provide the "content" parameter with the generated code.'
        );
      }
      throw new Error('code_generation executor: "content" is required and must be a non-empty string');
    }

    if (params.content.trim().length === 0) {
      throw new Error('code_generation executor: "content" must not be empty or whitespace-only');
    }

    // ── Validate file extension ───────────────────────────────────────────
    const ext = path.extname(params.filePath).toLowerCase();
    // Allow files with no extension (e.g. Makefile, Dockerfile)
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `code_generation executor: File extension "${ext}" is not allowed for code generation. ` +
        `Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`
      );
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(params.filePath, workspaceRoot);

    const encoding: BufferEncoding = params.encoding ?? 'utf-8';
    const createDirs = params.createDirs !== false; // default true

    // ── Create parent directories if needed ───────────────────────────────
    if (createDirs) {
      const dir = path.dirname(absolutePath);
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // ── Write the file ────────────────────────────────────────────────────
    await fs.promises.writeFile(absolutePath, params.content, encoding);

    const linesGenerated = params.content.split('\n').length;
    const bytesWritten = Buffer.byteLength(params.content, encoding);

    return {
      filePath: params.filePath,
      linesGenerated,
      bytesWritten,
    };
  };
};
