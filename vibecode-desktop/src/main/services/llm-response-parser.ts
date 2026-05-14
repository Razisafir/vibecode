// ============================================================
// VibeCode Desktop — LLM Response Parser
// Parses LLM text responses to extract structured, actionable data
// ============================================================

/**
 * A code block extracted from an LLM response.
 */
export interface ExtractedCodeBlock {
  /** Language identifier (e.g. "typescript", "python", "bash") */
  language: string;
  /** The raw code content */
  code: string;
  /** File path if one was mentioned in context before the code block */
  filePath?: string;
}

/**
 * An action verb extracted from an LLM response.
 */
export interface ExtractedAction {
  /** The action verb (e.g. "create", "edit", "modify", "run") */
  verb: string;
  /** The target of the action (e.g. a file path or command) */
  target: string;
  /** Additional details from surrounding text */
  details: string;
}

/**
 * A file operation extracted from an LLM response.
 */
export interface ExtractedFileOperation {
  /** Whether the file is being created, edited, or deleted */
  type: 'create' | 'edit' | 'delete';
  /** The file path */
  filePath: string;
  /** The content for a create or edit operation */
  content?: string;
}

/**
 * A command extracted from an LLM response.
 */
export interface ExtractedCommand {
  /** The command string */
  command: string;
  /** Working directory for the command */
  cwd?: string;
  /** Human-readable description */
  description?: string;
}

// ─── Regex Patterns ─────────────────────────────────────────────────────────

/** Markdown code fence: ```lang ... ``` (with optional filename after lang) */
const CODE_BLOCK_REGEX = /```(\w*)\s*(?:([^\n]+)\n)?([\s\S]*?)```/g;

/** File path patterns — must include an extension to avoid false positives */
const FILE_PATH_REGEX =
  /(?:^|[\s"'`(\[{,;]|(?:in|to|at|into|file|files?)\s*[:=]?\s*)([./\w\-]+(?:\/[\w\-]+)*\.\w{1,12})/gi;

/** Action verbs with optional targets */
const ACTION_VERB_REGEX =
  /\b(I(?:'ll| will| need to| should)?\s+)?(create|add|make|build|write|generate|set up|implement|modify|edit|update|change|refactor|fix|update|replace|delete|remove|install|run|execute)\s+(?:a\s+|the\s+|new\s+)?([^\n,.:;!?]{3,80})/gi;

/** Inline code with command-like patterns */
const INLINE_COMMAND_REGEX =
  /`([^`]*(?:npm|yarn|pnpm|pip|cargo|go|python|node|npx|git|make|docker|sh|bash|dotnet|ruby|gem|rake|mvn|gradle|cls|dir|echo|cat|ls|mkdir|rmdir|cp|mv|rm|chmod|curl|wget|tar|unzip)[^`]*)`/gi;

/** "Run ..." or "Execute ..." patterns */
const RUN_COMMAND_REGEX =
  /\b(?:run|execute|issue|invoke)\s+(?:the\s+)?(?:command\s*)?`([^`]+)`/gi;

/** Dangerous command patterns */
const DANGEROUS_COMMANDS =
  /\b(rm\s+-rf|npm\s+publish|npm\s+unpublish|git\s+push\s+--force|git\s+reset\s+--hard|pip\s+uninstall|cargo\s+publish|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE)\b/i;

/** Config file patterns */
const CONFIG_FILE_PATTERN =
  /(?:package\.json|tsconfig\.json|\.eslintrc|\.prettierrc|webpack\.config|vite\.config|rollup\.config|babel\.config|docker-compose|Dockerfile|\.env|\.gitignore|Makefile|CMakeLists)/i;

/** System file patterns */
const SYSTEM_FILE_PATTERN =
  /(?:\/etc\/|\/usr\/|\/bin\/|\/sbin\/|\/boot\/|\/var\/|C:\\Windows\\|C:\\Program Files\\)/i;

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * Parse markdown code blocks from an LLM response.
 *
 * Handles:
 * - Standard: ```typescript ... ```
 * - With filename: ```typescript src/foo.ts ... ```
 * - Language-less: ``` ... ```
 */
export function extractCodeBlocks(text: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = [];

  // Reset regex state
  CODE_BLOCK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CODE_BLOCK_REGEX.exec(text)) !== null) {
    const language = (match[1] || '').toLowerCase().trim();
    const maybeFilePath = (match[2] || '').trim();
    const code = match[3] || '';

    // Check if the "language" line is actually a file path
    let filePath: string | undefined;
    if (maybeFilePath && looksLikeFilePath(maybeFilePath)) {
      filePath = cleanFilePath(maybeFilePath);
    } else if (maybeFilePath && !language) {
      // If no language but something on first line, might be a path
      if (looksLikeFilePath(maybeFilePath)) {
        filePath = cleanFilePath(maybeFilePath);
      }
    }

    // Also look for a file path in the text immediately before the code block
    if (!filePath) {
      const blockStart = match.index;
      const precedingText = text.slice(Math.max(0, blockStart - 200), blockStart);
      filePath = extractClosestFilePath(precedingText);
    }

    blocks.push({
      language: language || 'text',
      code: code.trimEnd(),
      filePath,
    });
  }

  return blocks;
}

/**
 * Extract action verbs and their targets from an LLM response.
 *
 * Examples:
 * - "I'll create a new file" → { verb: "create", target: "a new file", ... }
 * - "Let me modify the Button component" → { verb: "modify", target: "the Button component", ... }
 */
export function extractActions(text: string): ExtractedAction[] {
  const actions: ExtractedAction[] = [];

  ACTION_VERB_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = ACTION_VERB_REGEX.exec(text)) !== null) {
    const verb = match[2].toLowerCase();
    const target = match[3].trim();

    // Skip very generic or conversational targets
    if (isConversationalTarget(target)) continue;

    // Extract details from surrounding context
    const start = Math.max(0, match.index - 50);
    const end = Math.min(text.length, match.index + match[0].length + 100);
    const surroundingText = text.slice(start, end);
    const details = surroundingText.replace(match[0], '').trim().slice(0, 200);

    actions.push({ verb, target, details });
  }

  return actions;
}

/**
 * Combine code blocks and actions to extract file operations.
 *
 * When a code block follows a "create"/"add" action, associate the code
 * with the file. When it follows an "edit"/"modify" action, mark as edit.
 */
export function extractFileOperations(text: string): ExtractedFileOperation[] {
  const operations: ExtractedFileOperation[] = [];
  const codeBlocks = extractCodeBlocks(text);
  const actions = extractActions(text);

  // Build a map: for each code block, find the closest preceding action
  for (const block of codeBlocks) {
    if (!block.filePath && !block.code) continue;

    const opType = determineOperationType(text, block, actions);
    const filePath = block.filePath || inferFilePath(block, actions);

    if (filePath) {
      operations.push({
        type: opType,
        filePath,
        content: block.code || undefined,
      });
    }
  }

  // Also capture actions that don't have code blocks (e.g. "delete src/foo.ts")
  for (const action of actions) {
    const targetPath = extractPathFromTarget(action.target);
    if (!targetPath) continue;

    // Skip if we already have an operation for this file
    if (operations.some((op) => op.filePath === targetPath)) continue;

    const type = actionVerbToOperationType(action.verb);
    if (type) {
      operations.push({
        type,
        filePath: targetPath,
      });
    }
  }

  return operations;
}

/**
 * Extract shell commands from an LLM response.
 *
 * Finds:
 * - Inline code with command-like patterns: `npm install`
 * - "Run `...`" or "Execute `...`" patterns
 */
export function extractCommands(text: string): ExtractedCommand[] {
  const commands: ExtractedCommand[] = [];
  const seen = new Set<string>();

  // Pattern 1: "Run `command`" / "Execute `command`"
  RUN_COMMAND_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RUN_COMMAND_REGEX.exec(text)) !== null) {
    const command = match[1].trim();
    if (!seen.has(command)) {
      seen.add(command);
      const contextStart = Math.max(0, match.index - 80);
      const description = text.slice(contextStart, match.index).trim().slice(-100);
      commands.push({ command, description: description || undefined });
    }
  }

  // Pattern 2: Inline code with known command prefixes
  INLINE_COMMAND_REGEX.lastIndex = 0;
  while ((match = INLINE_COMMAND_REGEX.exec(text)) !== null) {
    const command = match[1].trim();
    if (!seen.has(command) && command.length > 2) {
      seen.add(command);
      const contextStart = Math.max(0, match.index - 80);
      const description = text.slice(contextStart, match.index).trim().slice(-100);
      commands.push({ command, description: description || undefined });
    }
  }

  // Pattern 3: Standalone code blocks that look like shell scripts
  const codeBlocks = extractCodeBlocks(text);
  for (const block of codeBlocks) {
    if (isShellLanguage(block.language) && !block.filePath) {
      const lines = block.code.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length <= 5 && lines.length > 0) {
        // Short shell blocks are likely commands
        const command = lines.join(' && ');
        if (!seen.has(command)) {
          seen.add(command);
          commands.push({ command });
        }
      }
    }
  }

  return commands;
}

/**
 * Quick check if the response contains any actionable content.
 * Returns false for purely conversational responses.
 */
export function isActionable(text: string): boolean {
  // Has code blocks
  CODE_BLOCK_REGEX.lastIndex = 0;
  if (CODE_BLOCK_REGEX.test(text)) return true;

  // Has action verbs
  ACTION_VERB_REGEX.lastIndex = 0;
  if (ACTION_VERB_REGEX.test(text)) return true;

  // Has commands
  INLINE_COMMAND_REGEX.lastIndex = 0;
  if (INLINE_COMMAND_REGEX.test(text)) return true;

  // Has file paths with extensions
  FILE_PATH_REGEX.lastIndex = 0;
  if (FILE_PATH_REGEX.test(text)) return true;

  // Has step patterns like "1. ", "Step 1:", "- "
  if (/^\s*(?:\d+[\.\)]\s|step\s+\d|[-*]\s)/im.test(text)) return true;

  return false;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Check if a string looks like a file path (has extension, etc.)
 */
function looksLikeFilePath(s: string): boolean {
  // Must contain at least one path separator or have an extension
  if (/^\s*$/.test(s)) return false;
  // Has an extension (e.g. .ts, .tsx, .js, .py, .css)
  if (/\.\w{1,12}$/.test(s.trim())) return true;
  // Starts with ./ or ../ or / or ~
  if (/^[.\/~]/.test(s.trim())) return true;
  // Contains path separators with segments
  if (/[\w\-]+\/[\w\-]+/.test(s)) return true;
  return false;
}

/**
 * Clean up a file path string (remove leading/trailing quotes, etc.)
 */
function cleanFilePath(s: string): string {
  return s
    .replace(/^['"`]/, '')
    .replace(/['"`]$/, '')
    .replace(/^:?\s*/, '')
    .trim();
}

/**
 * Extract the closest file path from text preceding a code block.
 */
function extractClosestFilePath(precedingText: string): string | undefined {
  FILE_PATH_REGEX.lastIndex = 0;

  let lastMatch: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = FILE_PATH_REGEX.exec(precedingText)) !== null) {
    lastMatch = cleanFilePath(match[1]);
  }

  // Validate it has an extension
  if (lastMatch && /\.\w{1,12}$/.test(lastMatch)) {
    return lastMatch;
  }
  return undefined;
}

/**
 * Determine if a target string is conversational, not an action target.
 */
function isConversationalTarget(target: string): boolean {
  const lower = target.toLowerCase();
  const conversational = [
    'sure',
    'happy to help',
    'that work',
    'a note',
    'sense',
    'progress',
    'adjustments',
    'improvements',
    'changes',
    'updates',
    'modifications',
    'it work',
    'this work',
  ];
  return conversational.some((c) => lower.includes(c));
}

/**
 * Determine the operation type for a code block based on context.
 */
function determineOperationType(
  text: string,
  block: ExtractedCodeBlock,
  actions: ExtractedAction[]
): 'create' | 'edit' | 'delete' {
  // Find the position of this code block in the text
  const blockMarker = '```' + block.language;
  const blockIndex = text.indexOf(blockMarker);

  // Find the closest preceding action
  let closestAction: ExtractedAction | null = null;
  let closestDist = Infinity;

  for (const action of actions) {
    const actionIndex = text.indexOf(action.verb + ' ' + action.target);
    if (actionIndex >= 0 && actionIndex < blockIndex) {
      const dist = blockIndex - actionIndex;
      if (dist < closestDist && dist < 500) {
        closestDist = dist;
        closestAction = action;
      }
    }
  }

  if (closestAction) {
    const verb = closestAction.verb;
    if (verb === 'delete' || verb === 'remove') return 'delete';
    if (
      verb === 'edit' ||
      verb === 'modify' ||
      verb === 'update' ||
      verb === 'change' ||
      verb === 'refactor' ||
      verb === 'fix' ||
      verb === 'replace'
    ) {
      return 'edit';
    }
  }

  // Default: code blocks with no preceding action → create
  return 'create';
}

/**
 * Try to infer a file path from the code block and surrounding actions.
 */
function inferFilePath(
  block: ExtractedCodeBlock,
  actions: ExtractedAction[]
): string | undefined {
  // Try to find a file path in the action targets
  for (const action of actions) {
    const path = extractPathFromTarget(action.target);
    if (path && looksLikeFilePath(path)) return path;
  }

  // Infer from language
  const langToExt: Record<string, string> = {
    typescript: 'ts',
    ts: 'ts',
    typescriptreact: 'tsx',
    tsx: 'tsx',
    javascript: 'js',
    js: 'js',
    javascriptreact: 'jsx',
    jsx: 'jsx',
    python: 'py',
    py: 'py',
    rust: 'rs',
    rs: 'rs',
    go: 'go',
    java: 'java',
    ruby: 'rb',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yml',
    sql: 'sql',
    sh: 'sh',
    bash: 'sh',
    zsh: 'sh',
    dockerfile: 'Dockerfile',
    graphql: 'graphql',
    markdown: 'md',
    md: 'md',
  };

  const ext = langToExt[block.language];
  if (ext) {
    return `file.${ext}`; // Generic fallback
  }

  return undefined;
}

/**
 * Extract a file path from an action target string.
 */
function extractPathFromTarget(target: string): string | undefined {
  FILE_PATH_REGEX.lastIndex = 0;
  const match = FILE_PATH_REGEX.exec(target);
  if (match) return cleanFilePath(match[1]);

  // Check if the target itself looks like a path
  const trimmed = target.trim().replace(/^['"`]/, '').replace(/['"`]$/, '');
  if (looksLikeFilePath(trimmed)) return trimmed;

  return undefined;
}

/**
 * Map an action verb to a file operation type.
 */
function actionVerbToOperationType(
  verb: string
): 'create' | 'edit' | 'delete' | null {
  const createVerbs = ['create', 'add', 'make', 'build', 'write', 'generate', 'set up', 'implement', 'install'];
  const editVerbs = ['modify', 'edit', 'update', 'change', 'refactor', 'fix', 'replace'];
  const deleteVerbs = ['delete', 'remove'];

  if (createVerbs.includes(verb)) return 'create';
  if (editVerbs.includes(verb)) return 'edit';
  if (deleteVerbs.includes(verb)) return 'delete';

  return null;
}

/**
 * Check if a language identifier is a shell/scripting language.
 */
function isShellLanguage(language: string): boolean {
  return ['sh', 'bash', 'zsh', 'shell', 'cmd', 'powershell', 'ps1'].includes(language.toLowerCase());
}

/**
 * Check if a command is potentially dangerous.
 */
export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.test(command);
}

/**
 * Check if a file path points to a config file.
 */
export function isConfigFile(filePath: string): boolean {
  return CONFIG_FILE_PATTERN.test(filePath);
}

/**
 * Check if a file path points to a system file.
 */
export function isSystemFile(filePath: string): boolean {
  return SYSTEM_FILE_PATTERN.test(filePath);
}
