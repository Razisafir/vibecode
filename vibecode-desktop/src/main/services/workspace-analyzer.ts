// ─── Workspace Analyzer — Project Intelligence ──────────────────────────────
//
// Scans workspace directories and provides project intelligence including:
// - Project type detection (node, python, rust, go, etc.)
// - Language detection with file-count percentages
// - Framework detection
// - Git presence detection
// - Total file/directory counts
// - Workspace summary with warnings
// - Caching per workspace path
//
// This runs in the main process. It does NOT execute any commands.
// It only reads files that are safe and small.
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { logger } from '../utils/logger';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Directories to skip during recursive scan */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  'coverage', '.cache', '.venv', 'venv', '__pycache__',
  '.turbo', '.nuxt', '.output', '.svelte-kit',
  'target', 'bin', 'obj', '.dart_tool',
]);

/** File extensions to skip (binary/secret) */
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.sqlite', '.db', '.lock',
  '.class', '.o', '.obj', '.pyc', '.pyo', '.wasm',
]);

/** Max config file size to read (100KB) */
const MAX_CONFIG_SIZE = 100 * 1024;

/** Language detection by file extension */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.pyi': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin',
  '.c': 'C', '.h': 'C', '.cpp': 'C++', '.hpp': 'C++', '.cc': 'C++',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
  '.sql': 'SQL',
  '.html': 'HTML', '.htm': 'HTML',
  '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'LESS',
  '.vue': 'Vue', '.svelte': 'Svelte',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
  '.md': 'Markdown', '.mdx': 'MDX',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.r': 'R', '.R': 'R',
  '.zig': 'Zig',
  '.nim': 'Nim',
  '.ex': 'Elixir', '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.scala': 'Scala',
  '.clj': 'Clojure',
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportantFile {
  path: string;
  reason: string;
  type: 'package' | 'config' | 'source' | 'entry' | 'docs' | 'test';
}

export interface ScriptInfo {
  name: string;
  command: string;
  purpose: 'run' | 'build' | 'test' | 'lint' | 'format' | 'other';
}

export interface WarningInfo {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
}

export interface WorkspaceAnalysis {
  workspaceName: string;
  workspacePath: string;
  projectType: string;
  detectedLanguages: string[];
  detectedFrameworks: string[];
  languagePercentages: Record<string, number>;
  packageManager: string;
  importantFiles: ImportantFile[];
  scripts: ScriptInfo[];
  warnings: WarningInfo[];
  hasGit: boolean;
  totalFiles: number;
  totalDirectories: number;
  runCommand?: string;
  buildCommand?: string;
  testCommand?: string;
  lastScannedAt: string;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const analysisCache = new Map<string, { analysis: WorkspaceAnalysis; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Main Analyzer ──────────────────────────────────────────────────────────

/**
 * Analyze a workspace directory and return comprehensive project intelligence.
 * Results are cached for 5 minutes per workspace path.
 */
export async function analyzeWorkspace(workspacePath: string): Promise<WorkspaceAnalysis> {
  // Check cache first
  const cached = analysisCache.get(workspacePath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('workspace', `Returning cached analysis for ${workspacePath}`);
    return cached.analysis;
  }

  const summary: WorkspaceAnalysis = {
    workspaceName: path.basename(workspacePath),
    workspacePath,
    projectType: 'unknown',
    detectedLanguages: [],
    detectedFrameworks: [],
    languagePercentages: {},
    packageManager: 'unknown',
    importantFiles: [],
    scripts: [],
    warnings: [],
    hasGit: false,
    totalFiles: 0,
    totalDirectories: 0,
    lastScannedAt: new Date().toISOString(),
  };

  // Read top-level directory entries
  let topEntries: string[] = [];
  try {
    topEntries = await fsPromises.readdir(workspacePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.warnings.push({ severity: 'error', message: `Cannot read workspace: ${msg}` });
    return summary;
  }

  // ── Count files, directories, and languages ───────────────────────────
  const languageFileCounts: Record<string, number> = {};
  let totalFiles = 0;
  let totalDirs = 0;

  function walkDir(dir: string, depth: number): void {
    if (depth > 4) return; // Limit depth for performance
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        totalDirs++;
        walkDir(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SKIP_EXTENSIONS.has(ext)) {
          totalFiles++;
          const lang = EXTENSION_TO_LANGUAGE[ext];
          if (lang) {
            languageFileCounts[lang] = (languageFileCounts[lang] ?? 0) + 1;
          }
        }
      }
    }
  }

  walkDir(workspacePath, 0);

  summary.totalFiles = totalFiles;
  summary.totalDirectories = totalDirs;

  // Calculate language percentages
  const totalLangFiles = Object.values(languageFileCounts).reduce((sum, n) => sum + n, 0);
  if (totalLangFiles > 0) {
    for (const [lang, count] of Object.entries(languageFileCounts)) {
      summary.languagePercentages[lang] = Math.round((count / totalLangFiles) * 1000) / 10; // 1 decimal
    }
  }

  // Set detected languages sorted by count
  summary.detectedLanguages = Object.entries(languageFileCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);

  // ── Detect package manager from lockfiles ─────────────────────────────
  if (topEntries.includes('pnpm-lock.yaml')) {
    summary.packageManager = 'pnpm';
  } else if (topEntries.includes('yarn.lock')) {
    summary.packageManager = 'yarn';
  } else if (topEntries.includes('bun.lockb') || topEntries.includes('bun.lock')) {
    summary.packageManager = 'bun';
  } else if (topEntries.includes('package-lock.json')) {
    summary.packageManager = 'npm';
  }

  // ── Parse package.json ────────────────────────────────────────────────
  let pkgJson: Record<string, any> | null = null;
  if (topEntries.includes('package.json')) {
    try {
      const content = await fsPromises.readFile(path.join(workspacePath, 'package.json'), 'utf-8');
      if (content.length <= MAX_CONFIG_SIZE) {
        pkgJson = JSON.parse(content);
        summary.importantFiles.push({
          path: 'package.json',
          reason: 'Project manifest — dependencies, scripts, and metadata',
          type: 'package',
        });
      }
    } catch { /* Ignore parse errors */ }

    if (pkgJson) {
      const allDeps = { ...(pkgJson.dependencies ?? {}), ...(pkgJson.devDependencies ?? {}) };
      const depNames = new Set(Object.keys(allDeps));

      // Detect languages from dependencies
      if (depNames.has('typescript') || depNames.has('@types/node')) addLanguage(summary, 'TypeScript');
      if (depNames.has('react') || depNames.has('react-dom') || depNames.has('next')) { addLanguage(summary, 'JavaScript'); addFramework(summary, 'React'); }
      if (depNames.has('vue') || depNames.has('@vue/cli-service')) { addLanguage(summary, 'JavaScript'); addFramework(summary, 'Vue'); }
      if (depNames.has('svelte') || depNames.has('@sveltejs/kit')) { addLanguage(summary, 'JavaScript'); addFramework(summary, 'Svelte'); }
      if (depNames.has('angular') || depNames.has('@angular/core')) { addLanguage(summary, 'JavaScript'); addFramework(summary, 'Angular'); }
      if (depNames.has('next')) addFramework(summary, 'Next.js');
      if (depNames.has('nuxt')) addFramework(summary, 'Nuxt');
      if (depNames.has('vite') || depNames.has('@vitejs/plugin-react') || depNames.has('@vitejs/plugin-vue')) addFramework(summary, 'Vite');
      if (depNames.has('electron') || depNames.has('electron-builder')) addFramework(summary, 'Electron');
      if (depNames.has('express')) addFramework(summary, 'Express');
      if (depNames.has('fastify')) addFramework(summary, 'Fastify');
      if (depNames.has('koa')) addFramework(summary, 'Koa');
      if (depNames.has('tailwindcss')) addFramework(summary, 'Tailwind CSS');
      if (depNames.has('prisma')) addFramework(summary, 'Prisma');
      if (depNames.has('@nestjs/core')) addFramework(summary, 'NestJS');
      if (depNames.has('gatsby')) addFramework(summary, 'Gatsby');
      if (depNames.has('astro')) addFramework(summary, 'Astro');

      // If no JS/TS detected but has package.json, at least JS
      if (!summary.detectedLanguages.some(l => ['JavaScript', 'TypeScript'].includes(l))) {
        addLanguage(summary, 'JavaScript');
      }

      // Parse scripts
      if (pkgJson.scripts && typeof pkgJson.scripts === 'object') {
        for (const [name, command] of Object.entries(pkgJson.scripts)) {
          const cmd = String(command);
          const purpose = detectScriptPurpose(name, cmd);
          const script: ScriptInfo = { name, command: cmd, purpose };
          summary.scripts.push(script);

          const pkgCmd = getPkgRunCmd(summary.packageManager);
          if (purpose === 'run' && !summary.runCommand) summary.runCommand = `${pkgCmd} ${name}`;
          if (purpose === 'build' && !summary.buildCommand) summary.buildCommand = `${pkgCmd} ${name}`;
          if (purpose === 'test' && !summary.testCommand) summary.testCommand = `${pkgCmd} ${name}`;
        }
      }
    }
  }

  // ── Detect tsconfig.json ──────────────────────────────────────────────
  if (topEntries.includes('tsconfig.json')) {
    addLanguage(summary, 'TypeScript');
    summary.importantFiles.push({ path: 'tsconfig.json', reason: 'TypeScript configuration', type: 'config' });
  }

  // ── Detect Vite config ────────────────────────────────────────────────
  const viteConfigs = topEntries.filter(f => f.startsWith('vite.config.'));
  if (viteConfigs.length > 0) {
    addFramework(summary, 'Vite');
    summary.importantFiles.push({ path: viteConfigs[0], reason: 'Vite build configuration', type: 'config' });
  }

  // ── Detect Next.js config ─────────────────────────────────────────────
  const nextConfigs = topEntries.filter(f => f.startsWith('next.config.'));
  if (nextConfigs.length > 0) {
    addFramework(summary, 'Next.js');
    summary.importantFiles.push({ path: nextConfigs[0], reason: 'Next.js configuration', type: 'config' });
  }

  // ── Detect Electron main entry ────────────────────────────────────────
  if (pkgJson?.main && summary.detectedFrameworks.includes('Electron')) {
    summary.importantFiles.push({ path: pkgJson.main, reason: 'Electron main process entry point', type: 'entry' });
  }

  // ── Detect README ─────────────────────────────────────────────────────
  const readmeFiles = topEntries.filter(f => f.toLowerCase().startsWith('readme'));
  if (readmeFiles.length > 0) {
    summary.importantFiles.push({ path: readmeFiles[0], reason: 'Project documentation', type: 'docs' });
  }

  // ── Detect Python ─────────────────────────────────────────────────────
  if (topEntries.includes('pyproject.toml') || topEntries.includes('requirements.txt') || topEntries.includes('setup.py')) {
    addLanguage(summary, 'Python');
    if (topEntries.includes('pyproject.toml')) summary.importantFiles.push({ path: 'pyproject.toml', reason: 'Python project configuration', type: 'config' });
    if (topEntries.includes('requirements.txt')) summary.importantFiles.push({ path: 'requirements.txt', reason: 'Python dependencies', type: 'package' });
    if (topEntries.includes('setup.py')) summary.importantFiles.push({ path: 'setup.py', reason: 'Python package setup', type: 'config' });

    // Detect Python frameworks
    try {
      const reqContent = topEntries.includes('requirements.txt')
        ? await fsPromises.readFile(path.join(workspacePath, 'requirements.txt'), 'utf-8')
        : '';
      if (reqContent.includes('django') || reqContent.includes('Django')) addFramework(summary, 'Django');
      if (reqContent.includes('flask') || reqContent.includes('Flask')) addFramework(summary, 'Flask');
      if (reqContent.includes('fastapi') || reqContent.includes('FastAPI')) addFramework(summary, 'FastAPI');
    } catch { /* Ignore */ }
  }

  // ── Detect Rust ───────────────────────────────────────────────────────
  if (topEntries.includes('Cargo.toml')) {
    addLanguage(summary, 'Rust');
    summary.importantFiles.push({ path: 'Cargo.toml', reason: 'Rust package manifest', type: 'package' });
  }

  // ── Detect Go ─────────────────────────────────────────────────────────
  if (topEntries.includes('go.mod')) {
    addLanguage(summary, 'Go');
    summary.importantFiles.push({ path: 'go.mod', reason: 'Go module definition', type: 'package' });
  }

  // ── Detect Java ───────────────────────────────────────────────────────
  if (topEntries.includes('pom.xml')) {
    addLanguage(summary, 'Java');
    summary.importantFiles.push({ path: 'pom.xml', reason: 'Maven project configuration', type: 'package' });
  }
  if (topEntries.includes('build.gradle') || topEntries.includes('build.gradle.kts')) {
    addLanguage(summary, 'Java');
    addFramework(summary, 'Gradle');
    const gradleFile = topEntries.includes('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
    summary.importantFiles.push({ path: gradleFile, reason: 'Gradle build configuration', type: 'config' });
  }

  // ── Detect common directories ─────────────────────────────────────────
  if (topEntries.includes('src')) summary.importantFiles.push({ path: 'src/', reason: 'Primary source directory', type: 'source' });
  if (topEntries.includes('app') && summary.detectedFrameworks.includes('Next.js')) summary.importantFiles.push({ path: 'app/', reason: 'Next.js App Router directory', type: 'source' });
  if (topEntries.includes('pages')) summary.importantFiles.push({ path: 'pages/', reason: 'Pages/routes directory', type: 'source' });
  if (topEntries.includes('public')) summary.importantFiles.push({ path: 'public/', reason: 'Static assets directory', type: 'source' });

  const testDirs = topEntries.filter(f => f === 'tests' || f === 'test' || f === '__tests__' || f === 'spec');
  if (testDirs.length > 0) summary.importantFiles.push({ path: testDirs[0] + '/', reason: 'Test directory', type: 'test' });

  // ── Detect important config files ─────────────────────────────────────
  const configFiles: Array<[string, string, ImportantFile['type']]> = [
    ['.eslintrc', 'ESLint configuration', 'config'],
    ['.eslintrc.js', 'ESLint configuration', 'config'],
    ['.eslintrc.json', 'ESLint configuration', 'config'],
    ['.prettierrc', 'Prettier configuration', 'config'],
    ['.prettierrc.js', 'Prettier configuration', 'config'],
    ['tailwind.config.js', 'Tailwind CSS configuration', 'config'],
    ['tailwind.config.ts', 'Tailwind CSS configuration', 'config'],
    ['postcss.config.js', 'PostCSS configuration', 'config'],
    ['postcss.config.ts', 'PostCSS configuration', 'config'],
    ['webpack.config.js', 'Webpack configuration', 'config'],
    ['.babelrc', 'Babel configuration', 'config'],
    ['babel.config.js', 'Babel configuration', 'config'],
    ['docker-compose.yml', 'Docker Compose configuration', 'config'],
    ['Dockerfile', 'Docker build configuration', 'config'],
    ['.gitignore', 'Git ignore rules', 'config'],
    ['.editorconfig', 'Editor configuration', 'config'],
    ['jest.config.js', 'Jest test configuration', 'config'],
    ['jest.config.ts', 'Jest test configuration', 'config'],
    ['vitest.config.ts', 'Vitest test configuration', 'config'],
    ['playwright.config.ts', 'Playwright E2E test configuration', 'config'],
    ['prisma/schema.prisma', 'Prisma database schema', 'config'],
  ];

  for (const [filename, reason, type] of configFiles) {
    try {
      await fsPromises.access(path.join(workspacePath, filename));
      summary.importantFiles.push({ path: filename, reason, type });
    } catch { /* Not found */ }
  }

  // ── Detect Git ────────────────────────────────────────────────────────
  summary.hasGit = fs.existsSync(path.join(workspacePath, '.git'));

  // ── Determine project type ────────────────────────────────────────────
  summary.projectType = detectProjectType(summary);

  // ── Generate warnings ─────────────────────────────────────────────────
  generateWarnings(summary, topEntries, pkgJson);

  // ── Deduplicate ───────────────────────────────────────────────────────
  summary.detectedLanguages = [...new Set(summary.detectedLanguages)];
  summary.detectedFrameworks = [...new Set(summary.detectedFrameworks)];

  // Cache the result
  analysisCache.set(workspacePath, { analysis: summary, timestamp: Date.now() });

  logger.info('workspace', `Workspace analyzed: ${summary.workspaceName}`, {
    type: summary.projectType,
    languages: summary.detectedLanguages,
    files: summary.totalFiles,
  });

  return summary;
}

/**
 * Clear the analysis cache for a specific workspace, or all workspaces.
 */
export function clearAnalysisCache(workspacePath?: string): void {
  if (workspacePath) {
    analysisCache.delete(workspacePath);
  } else {
    analysisCache.clear();
  }
}

// ─── Helper Functions ───────────────────────────────────────────────────────

function addLanguage(summary: WorkspaceAnalysis, lang: string): void {
  if (!summary.detectedLanguages.includes(lang)) {
    summary.detectedLanguages.push(lang);
  }
}

function addFramework(summary: WorkspaceAnalysis, fw: string): void {
  if (!summary.detectedFrameworks.includes(fw)) {
    summary.detectedFrameworks.push(fw);
  }
}

function detectScriptPurpose(name: string, command: string): ScriptInfo['purpose'] {
  const lower = name.toLowerCase();
  const cmdLower = command.toLowerCase();

  if (lower === 'dev' || lower === 'start' || lower === 'serve') return 'run';
  if (lower === 'build' || lower === 'compile' || lower === 'bundle' || lower === 'pack') return 'build';
  if (lower === 'test' || lower === 'test:watch' || lower === 'test:coverage' || lower.startsWith('test:') || lower === 'spec' || lower === 'jest' || lower === 'vitest') return 'test';
  if (lower === 'lint' || lower.startsWith('lint:') || lower === 'eslint' || lower === 'tslint') return 'lint';
  if (lower === 'format' || lower === 'prettier' || lower === 'style:fix') return 'format';

  // Heuristic from command content
  if (cmdLower.includes('vite') && !cmdLower.includes('build')) return 'run';
  if (cmdLower.includes('next') && cmdLower.includes('dev')) return 'run';
  if (cmdLower.includes('webpack') && cmdLower.includes('--watch')) return 'run';

  return 'other';
}

function getPkgRunCmd(pm: string): string {
  switch (pm) {
    case 'pnpm': return 'pnpm run';
    case 'yarn': return 'yarn';
    case 'bun': return 'bun run';
    default: return 'npm run';
  }
}

function detectProjectType(summary: WorkspaceAnalysis): string {
  if (summary.detectedFrameworks.includes('Electron')) return 'electron';
  if (summary.detectedFrameworks.includes('VS Code Extension')) return 'extension';
  if (summary.detectedFrameworks.includes('Next.js') || summary.detectedFrameworks.includes('Nuxt') ||
      summary.detectedFrameworks.includes('Gatsby') || summary.detectedFrameworks.includes('Astro') ||
      summary.detectedFrameworks.includes('React') || summary.detectedFrameworks.includes('Vue') ||
      summary.detectedFrameworks.includes('Svelte') || summary.detectedFrameworks.includes('Angular')) {
    return 'web';
  }
  if (summary.detectedLanguages.includes('Python')) return 'python';
  if (summary.detectedLanguages.includes('Rust')) return 'rust';
  if (summary.detectedLanguages.includes('Go')) return 'go';
  if (summary.detectedLanguages.includes('Java') || summary.detectedLanguages.includes('Kotlin')) return 'java';
  if (summary.detectedLanguages.includes('TypeScript') || summary.detectedLanguages.includes('JavaScript')) return 'node';
  return 'unknown';
}

function generateWarnings(summary: WorkspaceAnalysis, topEntries: string[], pkgJson: Record<string, any> | null): void {
  // Missing README
  const hasReadme = topEntries.some(f => f.toLowerCase().startsWith('readme'));
  if (!hasReadme) {
    summary.warnings.push({ severity: 'info', message: 'No README found. Consider adding project documentation.' });
  }

  // Missing lockfile
  if (pkgJson) {
    const hasLockfile = topEntries.some(f =>
      f === 'package-lock.json' || f === 'yarn.lock' ||
      f === 'pnpm-lock.yaml' || f === 'bun.lockb' || f === 'bun.lock'
    );
    if (!hasLockfile) {
      summary.warnings.push({ severity: 'warning', message: 'No lockfile found. Run your package manager to generate one for reproducible installs.' });
    }
  }

  // Missing test script
  if (!summary.scripts.some(s => s.purpose === 'test')) {
    summary.warnings.push({ severity: 'info', message: 'No test script detected. Consider adding automated tests.' });
  }

  // Missing build script (web/electron)
  if (summary.projectType === 'web' || summary.projectType === 'electron') {
    if (!summary.scripts.some(s => s.purpose === 'build')) {
      summary.warnings.push({ severity: 'info', message: 'No build script detected. Consider adding a production build step.' });
    }
  }

  // Missing lint script
  if (!summary.scripts.some(s => s.purpose === 'lint') && pkgJson) {
    summary.warnings.push({ severity: 'info', message: 'No lint script detected. Consider adding a linter for code quality.' });
  }

  // No .gitignore
  if (!topEntries.includes('.gitignore') && summary.hasGit) {
    summary.warnings.push({ severity: 'info', message: 'No .gitignore found. Consider adding one to avoid committing build artifacts.' });
  }

  // .env files present (warn about secrets)
  const envFiles = topEntries.filter(f => f.startsWith('.env') && !f.endsWith('.example'));
  if (envFiles.length > 0) {
    summary.warnings.push({
      severity: 'warning',
      message: `.env file(s) detected (${envFiles.join(', ')}). Ensure secrets are not committed to version control.`,
      file: envFiles[0],
    });
  }
}

// ─── Report Generators ─────────────────────────────────────────────────────

/**
 * Generate a heuristic explanation of the workspace (when no AI provider is available).
 */
export function generateHeuristicExplanation(summary: WorkspaceAnalysis): string {
  const lines: string[] = [];
  lines.push(`# ${summary.workspaceName} — Project Overview\n`);

  lines.push(`## What This Project Is`);
  if (summary.projectType === 'web') {
    lines.push(`This is a **web application** built with ${summary.detectedFrameworks.join(' + ') || 'JavaScript'}.`);
  } else if (summary.projectType === 'electron') {
    lines.push(`This is an **Electron desktop application** combining web technologies (${summary.detectedFrameworks.filter(f => f !== 'Electron').join(' + ') || 'JavaScript'}) with native desktop capabilities.`);
  } else if (summary.projectType === 'python') {
    lines.push(`This is a **Python project**${summary.detectedFrameworks.length > 0 ? ` using ${summary.detectedFrameworks.join(' + ')}` : ''}.`);
  } else if (summary.projectType === 'node') {
    lines.push(`This is a **Node.js project**${summary.detectedFrameworks.length > 0 ? ` using ${summary.detectedFrameworks.join(' + ')}` : ''}.`);
  } else if (summary.projectType === 'rust') {
    lines.push(`This is a **Rust project**.`);
  } else if (summary.projectType === 'go') {
    lines.push(`This is a **Go project**.`);
  } else {
    lines.push(`This project's type could not be automatically determined.`);
  }

  lines.push(`\n## Project Structure`);
  if (summary.importantFiles.length > 0) {
    const byType: Record<string, ImportantFile[]> = {};
    for (const f of summary.importantFiles) {
      if (!byType[f.type]) byType[f.type] = [];
      byType[f.type].push(f);
    }
    for (const [type, files] of Object.entries(byType)) {
      lines.push(`\n**${type.charAt(0).toUpperCase() + type.slice(1)} files:**`);
      for (const f of files) lines.push(`- \`${f.path}\` — ${f.reason}`);
    }
  }

  lines.push(`\n## How to Run It`);
  if (summary.packageManager !== 'unknown') {
    lines.push(`This project uses **${summary.packageManager}** as its package manager.`);
    lines.push(`1. Install dependencies: \`${getPkgRunCmd(summary.packageManager).replace('run', 'install')}\``);
    if (summary.runCommand) lines.push(`2. Start development: \`${summary.runCommand}\``);
  }
  if (summary.buildCommand) lines.push(`- Build for production: \`${summary.buildCommand}\``);
  if (summary.testCommand) lines.push(`- Run tests: \`${summary.testCommand}\``);

  if (summary.warnings.length > 0) {
    lines.push(`\n## Notes & Warnings`);
    for (const w of summary.warnings) {
      const icon = w.severity === 'error' ? '❌' : w.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${icon} ${w.message}`);
    }
  }

  lines.push(`\n## Detected Stack`);
  lines.push(`- **Languages:** ${summary.detectedLanguages.join(', ') || 'Unknown'}`);
  lines.push(`- **Frameworks:** ${summary.detectedFrameworks.join(', ') || 'None detected'}`);
  lines.push(`- **Package Manager:** ${summary.packageManager}`);
  lines.push(`- **Git:** ${summary.hasGit ? 'Yes' : 'No'}`);
  lines.push(`- **Total Files:** ${summary.totalFiles}`);
  lines.push(`- **Total Directories:** ${summary.totalDirectories}`);

  return lines.join('\n');
}
