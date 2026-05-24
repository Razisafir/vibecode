// ============================================================
// VibeCode Desktop — Monaco AI Integration Module
// Makes the AI live INSIDE the editor with decorations, ghost
// text, code actions, edit regions, diagnostics, and more.
// ============================================================

import * as monaco from 'monaco-editor';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { DiffResult, DiffLine } from '../../types';

// ─── CSS Class Names for Monaco Decorations ──────────────────

const CSS_CLASSES = {
  DIFF_ADD_BG: 'vibecode-diff-add-bg',
  DIFF_REMOVE_BG: 'vibecode-diff-remove-bg',
  DIFF_ADD_GUTTER: 'vibecode-diff-add-gutter',
  DIFF_REMOVE_GUTTER: 'vibecode-diff-remove-gutter',
  GHOST_TEXT: 'vibecode-ghost-text',
  EDIT_REGION_BG: 'vibecode-edit-region-bg',
  EDIT_REGION_BORDER: 'vibecode-edit-region-border',
  EXECUTION_LINE: 'vibecode-execution-line',
  DIAGNOSTIC_INFO: 'vibecode-diagnostic-info',
  DIAGNOSTIC_WARNING: 'vibecode-diagnostic-warning',
  DIAGNOSTIC_ERROR: 'vibecode-diagnostic-error',
  ACCEPT_ACTION: 'vibecode-accept-action',
  REJECT_ACTION: 'vibecode-reject-action',
} as const;

// ─── Change Tracking for Accept/Reject ───────────────────────

interface TrackedChange {
  id: string;
  type: 'add' | 'remove';
  startLine: number;
  endLine: number;
  originalContent: string;
  newContent: string;
  decorationIds: string[];
}

// Per-editor decoration ID stores (for clearing by type without `description`)
const diffDecorationIds = new WeakMap<MonacoEditor.ICodeEditor, string[]>();
const ghostTextDecorationIds = new WeakMap<MonacoEditor.ICodeEditor, string[]>();
const editRegionDecorationIds = new WeakMap<MonacoEditor.ICodeEditor, string[]>();
const executionDecorationIds = new WeakMap<MonacoEditor.ICodeEditor, string[]>();
const diagnosticDecorationIds = new WeakMap<MonacoEditor.ICodeEditor, string[]>();

// Map of editor instance → tracked changes
const trackedChangesMap = new WeakMap<MonacoEditor.ICodeEditor, Map<string, TrackedChange>>();

// ─── Style Registration ──────────────────────────────────────

let stylesInjected = false;

/**
 * Inject CSS styles into the document for Monaco decorations.
 * Called once automatically on first use.
 */
function ensureStylesInjected(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const styleEl = document.createElement('style');
  styleEl.id = 'vibecode-ai-editor-styles';
  styleEl.textContent = `
    /* ── Inline Diff Decorations ── */
    .${CSS_CLASSES.DIFF_ADD_BG} {
      background-color: rgba(34, 197, 94, 0.12) !important;
      border-left: 2px solid rgba(34, 197, 94, 0.5);
    }
    .${CSS_CLASSES.DIFF_REMOVE_BG} {
      background-color: rgba(239, 68, 68, 0.12) !important;
      border-left: 2px solid rgba(239, 68, 68, 0.5);
      text-decoration: line-through;
      opacity: 0.7;
    }
    .${CSS_CLASSES.DIFF_ADD_GUTTER} {
      background-color: rgba(34, 197, 94, 0.5);
      border-radius: 50%;
      width: 6px !important;
      height: 6px !important;
      margin-left: 4px;
      margin-top: 7px;
    }
    .${CSS_CLASSES.DIFF_REMOVE_GUTTER} {
      background-color: rgba(239, 68, 68, 0.5);
      border-radius: 50%;
      width: 6px !important;
      height: 6px !important;
      margin-left: 4px;
      margin-top: 7px;
    }

    /* ── Ghost Text ── */
    .${CSS_CLASSES.GHOST_TEXT} {
      color: rgba(160, 160, 174, 0.4) !important;
      font-style: italic !important;
      pointer-events: none;
    }

    /* ── AI Edit Region ── */
    .${CSS_CLASSES.EDIT_REGION_BG} {
      background-color: rgba(99, 102, 241, 0.06) !important;
    }
    .${CSS_CLASSES.EDIT_REGION_BORDER} {
      border-left: 2px solid rgba(99, 102, 241, 0.5) !important;
      animation: vibecodeEditRegionPulse 2s ease-in-out infinite;
    }

    /* ── Execution Line ── */
    .${CSS_CLASSES.EXECUTION_LINE} {
      background-color: rgba(99, 102, 241, 0.08) !important;
      border-left: 3px solid #6366f1 !important;
      animation: vibecodeExecutionPulse 1s ease-in-out infinite;
    }

    /* ── AI Diagnostics ── */
    .${CSS_CLASSES.DIAGNOSTIC_INFO} {
      background-color: rgba(59, 130, 246, 0.06) !important;
      border-left: 2px solid rgba(59, 130, 246, 0.4);
    }
    .${CSS_CLASSES.DIAGNOSTIC_WARNING} {
      background-color: rgba(245, 158, 11, 0.06) !important;
      border-left: 2px solid rgba(245, 158, 11, 0.4);
    }
    .${CSS_CLASSES.DIAGNOSTIC_ERROR} {
      background-color: rgba(239, 68, 68, 0.06) !important;
      border-left: 2px solid rgba(239, 68, 68, 0.4);
    }

    /* ── Inline Accept/Reject Actions ── */
    .${CSS_CLASSES.ACCEPT_ACTION} {
      color: #22c55e !important;
      font-weight: 600;
      font-size: 10px;
      cursor: pointer;
    }
    .${CSS_CLASSES.REJECT_ACTION} {
      color: #ef4444 !important;
      font-weight: 600;
      font-size: 10px;
      cursor: pointer;
    }

    /* ── Keyframe Animations ── */
    @keyframes vibecodeEditRegionPulse {
      0%, 100% { border-left-color: rgba(99, 102, 241, 0.3); }
      50% { border-left-color: rgba(99, 102, 241, 0.7); }
    }

    @keyframes vibecodeExecutionPulse {
      0%, 100% { border-left-color: rgba(99, 102, 241, 0.5); }
      50% { border-left-color: rgba(99, 102, 241, 1); }
    }
  `;
  document.head.appendChild(styleEl);
}

// ─── Helper: Get or create tracked changes map ───────────────

function getTrackedChanges(editor: MonacoEditor.ICodeEditor): Map<string, TrackedChange> {
  let map = trackedChangesMap.get(editor);
  if (!map) {
    map = new Map();
    trackedChangesMap.set(editor, map);
  }
  return map;
}

// ─── Helper: Store & clear decoration IDs by type ────────────

function storeDecorationIds(
  store: WeakMap<MonacoEditor.ICodeEditor, string[]>,
  editor: MonacoEditor.ICodeEditor,
  ids: string[],
): void {
  const existing = store.get(editor) ?? [];
  store.set(editor, [...existing, ...ids]);
}

function clearDecorationIds(
  store: WeakMap<MonacoEditor.ICodeEditor, string[]>,
  editor: MonacoEditor.ICodeEditor,
): void {
  const ids = store.get(editor);
  if (ids && ids.length > 0) {
    editor.deltaDecorations(ids, []);
  }
  store.delete(editor);
}

// ─── Helper: Group contiguous diff lines ─────────────────────

interface DiffGroup {
  type: 'add' | 'remove';
  startLine: number;
  endLine: number;
  lines: DiffLine[];
}

function groupDiffLines(lines: DiffLine[]): DiffGroup[] {
  const groups: DiffGroup[] = [];
  let current: DiffGroup | null = null;

  for (const line of lines) {
    if (line.type === 'context') {
      current = null;
      continue;
    }

    // Map to editor line number: use newLineNumber for adds, oldLineNumber for removes
    const editorLine = line.type === 'add'
      ? (line.newLineNumber ?? line.lineNumber)
      : (line.oldLineNumber ?? line.lineNumber);

    if (current && current.type === line.type && editorLine === current.endLine + 1) {
      current.endLine = editorLine;
      current.lines.push(line);
    } else {
      current = {
        type: line.type as 'add' | 'remove',
        startLine: editorLine,
        endLine: editorLine,
        lines: [line],
      };
      groups.push(current);
    }
  }

  return groups;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

// ─── 1. Inline Diff Decorations ──────────────────────────────

/**
 * Show diff lines as colored decorations in the editor.
 * Green background for additions, red background for deletions.
 * Gutter icons indicate change type.
 */
export function showInlineDiff(
  editor: MonacoEditor.ICodeEditor,
  diffResult: DiffResult,
): string[] {
  ensureStylesInjected();

  // Clear any existing diff decorations first
  clearInlineDiffs(editor);

  const decorations: MonacoEditor.IModelDeltaDecoration[] = [];
  const trackedChanges = getTrackedChanges(editor);
  const changeIdToDecorationIndex = new Map<string, number>();

  const groups = groupDiffLines(diffResult.lines);

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const isAdd = group.type === 'add';
    const changeId = `diff-${group.type}-${group.startLine}-${group.endLine}-${Date.now()}-${gi}`;

    decorations.push({
      range: new monaco.Range(group.startLine, 1, group.endLine, 1),
      options: {
        isWholeLine: true,
        className: isAdd ? CSS_CLASSES.DIFF_ADD_BG : CSS_CLASSES.DIFF_REMOVE_BG,
        glyphMarginClassName: isAdd ? CSS_CLASSES.DIFF_ADD_GUTTER : CSS_CLASSES.DIFF_REMOVE_GUTTER,
        glyphMarginHoverMessage: {
          value: isAdd
            ? `**Addition** — ${group.endLine - group.startLine + 1} line(s) added`
            : `**Deletion** — ${group.endLine - group.startLine + 1} line(s) removed`,
        },
        overviewRuler: {
          color: isAdd ? '#22c55e' : '#ef4444',
          position: monaco.editor.OverviewRulerLane.Left,
        },
        minimap: {
          color: isAdd ? '#22c55e40' : '#ef444440',
          position: monaco.editor.MinimapPosition.Inline,
        },
      },
    });

    changeIdToDecorationIndex.set(changeId, gi);

    // Track the change for accept/reject
    trackedChanges.set(changeId, {
      id: changeId,
      type: group.type,
      startLine: group.startLine,
      endLine: group.endLine,
      originalContent: group.type === 'remove'
        ? group.lines.map((l) => l.content).join('\n')
        : '',
      newContent: group.type === 'add'
        ? group.lines.map((l) => l.content).join('\n')
        : '',
      decorationIds: [],
    });
  }

  // Apply all decorations at once for performance
  const appliedIds = editor.deltaDecorations([], decorations);

  // Store the IDs for later clearing
  storeDecorationIds(diffDecorationIds, editor, appliedIds);

  // Update tracked changes with the applied decoration IDs
  for (const [changeId, index] of changeIdToDecorationIndex) {
    const change = trackedChanges.get(changeId);
    if (change && index < appliedIds.length) {
      change.decorationIds = [appliedIds[index]];
    }
  }

  return appliedIds;
}

/**
 * Remove all diff decorations from the editor.
 */
export function clearInlineDiffs(editor: MonacoEditor.ICodeEditor): void {
  clearDecorationIds(diffDecorationIds, editor);

  // Clear tracked changes
  const trackedChanges = trackedChangesMap.get(editor);
  if (trackedChanges) {
    trackedChanges.clear();
  }
}

// ─── 2. Ghost Text Suggestions ───────────────────────────────

/**
 * Show faded "ghost" suggestion text at a position in the editor.
 * The ghost text is rendered as a decoration with afterContentClassName styling.
 * Semi-transparent, italic text that appears inline after the cursor.
 */
export function showGhostText(
  editor: MonacoEditor.ICodeEditor,
  text: string,
  position: monaco.IPosition,
): string[] {
  ensureStylesInjected();

  // Clear any existing ghost text first
  clearGhostText(editor);

  // We split the ghost text by newlines to render each line
  const lines = text.split('\n');

  const decorations: MonacoEditor.IModelDeltaDecoration[] = [];

  // First line: inline ghost text after cursor
  if (lines[0]) {
    decorations.push({
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      options: {
        after: {
          content: lines[0],
          inlineClassName: CSS_CLASSES.GHOST_TEXT,
          cursorStops: monaco.editor.InjectedTextCursorStops.None,
        },
      },
    });
  }

  // Subsequent lines: full-line ghost text
  for (let i = 1; i < lines.length; i++) {
    decorations.push({
      range: new monaco.Range(position.lineNumber + i, 1, position.lineNumber + i, 1),
      options: {
        after: {
          content: lines[i],
          inlineClassName: CSS_CLASSES.GHOST_TEXT,
          cursorStops: monaco.editor.InjectedTextCursorStops.None,
        },
        isWholeLine: true,
      },
    });
  }

  const ids = editor.deltaDecorations([], decorations);
  storeDecorationIds(ghostTextDecorationIds, editor, ids);
  return ids;
}

/**
 * Remove ghost text decorations from the editor.
 */
export function clearGhostText(editor: MonacoEditor.ICodeEditor): void {
  clearDecorationIds(ghostTextDecorationIds, editor);
}

// ─── 3. AI Code Actions ──────────────────────────────────────

/** AI action types that can be triggered from the editor */
export type AIActionType = 'explain' | 'refactor' | 'test' | 'fix' | 'optimize';

/** Event detail for the custom vibecode:ai-action event */
export interface AIActionEventDetail {
  type: AIActionType;
  selection: string;
  range: monaco.IRange;
  language: string;
  filePath?: string;
}

/** Code action provider disposable for cleanup */
let codeActionDisposable: monaco.IDisposable | null = null;

/**
 * Action definitions for the VibeCode AI code action provider.
 * Uses string values for CodeAction kinds since
 * `monaco.languages.CodeActionKind` is not exported in this version.
 */
const ACTION_DEFINITIONS: Array<{
  title: string;
  type: AIActionType;
  kind: string;
}> = [
  {
    title: '✨ Explain this code',
    type: 'explain',
    kind: 'quickfix',
  },
  {
    title: '🔧 Refactor this',
    type: 'refactor',
    kind: 'refactor.extract',
  },
  {
    title: '🧪 Generate tests',
    type: 'test',
    kind: 'refactor.rewrite',
  },
  {
    title: '🐛 Fix issues',
    type: 'fix',
    kind: 'quickfix',
  },
  {
    title: '⚡ Optimize',
    type: 'optimize',
    kind: 'refactor.rewrite',
  },
];

/**
 * Register the "VibeCode AI" code action provider that adds AI actions
 * to the right-click context menu and the lightbulb menu.
 * Also registers editor actions on the given editor instance so that
 * the code action commands resolve correctly.
 *
 * Note: The editor parameter should be an IStandaloneCodeEditor for
 * addAction support. It is typed as ICodeEditor for broader compatibility
 * but will be cast internally.
 */
export function registerAICodeActions(
  editor: MonacoEditor.ICodeEditor,
): monaco.IDisposable {
  // Dispose previous registration if any
  if (codeActionDisposable) {
    codeActionDisposable.dispose();
  }

  // Register the code action provider globally for all languages
  codeActionDisposable = monaco.languages.registerCodeActionProvider(
    '*', // All languages
    {
      provideCodeActions(model, range) {
        const actions: monaco.languages.CodeAction[] = ACTION_DEFINITIONS.map(
          (def) => ({
            title: def.title,
            kind: def.kind,
            diagnostics: [],
            isPreferred: false,
            edit: undefined, // No edit — we fire an event instead
            command: {
              id: `vibecode.ai.${def.type}`,
              title: def.title,
              arguments: [range],
            },
          }),
        );

        return {
          actions,
          dispose() { /* no-op */ },
        };
      },
    },
  );

  // Register editor actions on the specific editor instance.
  // These handle the commands invoked by the code actions and also
  // add entries to the editor's right-click context menu.
  // We cast to access addAction (available on IStandaloneCodeEditor).
  const standaloneEditor = editor as MonacoEditor.IStandaloneCodeEditor;
  const editorActionDisposables = ACTION_DEFINITIONS.map((def) =>
    standaloneEditor.addAction({
      id: `vibecode.ai.${def.type}`,
      label: def.title,
      keybindings: undefined,
      contextMenuGroupId: 'vibecode_ai',
      contextMenuOrder: def.type === 'explain' ? 1 : def.type === 'refactor' ? 2 : def.type === 'test' ? 3 : def.type === 'fix' ? 4 : 5,
      run: (ed: MonacoEditor.ICodeEditor) => {
        fireAIActionEvent(ed, def.type);
      },
    }),
  );

  return {
    dispose() {
      codeActionDisposable?.dispose();
      codeActionDisposable = null;
      editorActionDisposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * Fire a custom DOM event for an AI action, gathering the current
 * selection/range from the editor.
 */
function fireAIActionEvent(
  editor: MonacoEditor.ICodeEditor,
  actionType: AIActionType,
): void {
  const model = editor.getModel();
  if (!model) return;

  const selection = editor.getSelection();
  const effectiveRange = selection ?? new monaco.Range(1, 1, 1, 1);
  const selectedText = selection
    ? model.getValueInRange(selection)
    : '';

  // If nothing selected, use the current line
  const textToUse = selectedText || model.getLineContent(effectiveRange.startLineNumber);

  const detail: AIActionEventDetail = {
    type: actionType,
    selection: textToUse,
    range: effectiveRange,
    language: model.getLanguageId(),
  };

  window.dispatchEvent(
    new CustomEvent('vibecode:ai-action', { detail }),
  );
}

// ─── 4. AI Edit Regions ──────────────────────────────────────

/**
 * Highlight a region that AI is actively editing.
 * Blue/indigo subtle background with animated left border.
 */
export function highlightEditRegion(
  editor: MonacoEditor.ICodeEditor,
  startLine: number,
  endLine: number,
): string[] {
  ensureStylesInjected();

  // Clear any existing edit region highlights
  clearEditRegion(editor);

  const decorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(startLine, 1, endLine, 1),
      options: {
        isWholeLine: true,
        className: CSS_CLASSES.EDIT_REGION_BG,
        linesDecorationsClassName: CSS_CLASSES.EDIT_REGION_BORDER,
        overviewRuler: {
          color: '#6366f180',
          position: monaco.editor.OverviewRulerLane.Left,
        },
        minimap: {
          color: '#6366f130',
          position: monaco.editor.MinimapPosition.Inline,
        },
      },
    },
  ];

  const ids = editor.deltaDecorations([], decorations);
  storeDecorationIds(editRegionDecorationIds, editor, ids);
  return ids;
}

/**
 * Remove edit region highlight from the editor.
 */
export function clearEditRegion(editor: MonacoEditor.ICodeEditor): void {
  clearDecorationIds(editRegionDecorationIds, editor);
}

// ─── 5. Execution Highlights ─────────────────────────────────

/**
 * Highlight the line currently being executed by the AI.
 * Animated accent color left border with subtle background.
 */
export function highlightExecutionLine(
  editor: MonacoEditor.ICodeEditor,
  lineNumber: number,
): string[] {
  ensureStylesInjected();

  // First clear any existing execution highlights
  clearExecutionHighlight(editor);

  const decorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: CSS_CLASSES.EXECUTION_LINE,
        overviewRuler: {
          color: '#6366f1',
          position: monaco.editor.OverviewRulerLane.Center,
        },
      },
    },
  ];

  const ids = editor.deltaDecorations([], decorations);
  storeDecorationIds(executionDecorationIds, editor, ids);
  return ids;
}

/**
 * Remove execution highlight from the editor.
 */
export function clearExecutionHighlight(editor: MonacoEditor.ICodeEditor): void {
  clearDecorationIds(executionDecorationIds, editor);
}

// ─── 6. Diagnostic Decorations ───────────────────────────────

export interface AIDiagnostic {
  line: number;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

/**
 * Show inline diagnostic messages from AI analysis.
 * Each diagnostic is rendered as a line decoration with severity-appropriate
 * styling and a hover message.
 */
export function showAIDiagnostics(
  editor: MonacoEditor.ICodeEditor,
  diagnostics: AIDiagnostic[],
): string[] {
  ensureStylesInjected();

  // Clear existing AI diagnostics first
  clearAIDiagnostics(editor);

  const decorations: MonacoEditor.IModelDeltaDecoration[] = diagnostics.map(
    (diag) => {
      const severityClass =
        diag.severity === 'error'
          ? CSS_CLASSES.DIAGNOSTIC_ERROR
          : diag.severity === 'warning'
            ? CSS_CLASSES.DIAGNOSTIC_WARNING
            : CSS_CLASSES.DIAGNOSTIC_INFO;

      const severityIcon =
        diag.severity === 'error'
          ? '❌'
          : diag.severity === 'warning'
            ? '⚠️'
            : 'ℹ️';

      return {
        range: new monaco.Range(diag.line, 1, diag.line, 1),
        options: {
          isWholeLine: true,
          className: severityClass,
          hoverMessage: {
            value: `${severityIcon} **VibeCode AI**: ${diag.message}`,
          },
          overviewRuler: {
            color:
              diag.severity === 'error'
                ? '#ef4444'
                : diag.severity === 'warning'
                  ? '#f59e0b'
                  : '#3b82f6',
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      };
    },
  );

  const ids = editor.deltaDecorations([], decorations);
  storeDecorationIds(diagnosticDecorationIds, editor, ids);
  return ids;
}

/**
 * Remove AI diagnostic decorations from the editor.
 */
export function clearAIDiagnostics(editor: MonacoEditor.ICodeEditor): void {
  clearDecorationIds(diagnosticDecorationIds, editor);
}

// ─── 7. Accept/Reject Changes ────────────────────────────────

/**
 * Accept a tracked change: remove the diff decoration and keep the content.
 * For additions: the new content stays, decoration is removed.
 * For deletions: nothing to do (content was already removed), just clean up.
 */
export function acceptChange(
  editor: MonacoEditor.ICodeEditor,
  changeId: string,
): void {
  const trackedChanges = getTrackedChanges(editor);
  const change = trackedChanges.get(changeId);
  if (!change) return;

  // Remove decorations for this change
  if (change.decorationIds.length > 0) {
    editor.deltaDecorations(change.decorationIds, []);
  }

  // Remove from tracking
  trackedChanges.delete(changeId);

  // Also remove from the diff decoration store
  const diffIds = diffDecorationIds.get(editor);
  if (diffIds) {
    const remaining = diffIds.filter((id) => !change.decorationIds.includes(id));
    diffDecorationIds.set(editor, remaining);
  }

  // Fire event
  window.dispatchEvent(
    new CustomEvent('vibecode:change-accepted', {
      detail: { changeId, type: change.type },
    }),
  );
}

/**
 * Reject a tracked change: remove the diff decoration and revert the content.
 * For additions: remove the added lines.
 * For deletions: restore the deleted lines.
 */
export function rejectChange(
  editor: MonacoEditor.ICodeEditor,
  changeId: string,
): void {
  const trackedChanges = getTrackedChanges(editor);
  const change = trackedChanges.get(changeId);
  if (!change) return;

  const model = editor.getModel();
  if (!model) return;

  // Remove decorations first
  if (change.decorationIds.length > 0) {
    editor.deltaDecorations(change.decorationIds, []);
  }

  // Also remove from the diff decoration store
  const diffIds = diffDecorationIds.get(editor);
  if (diffIds) {
    const remaining = diffIds.filter((id) => !change.decorationIds.includes(id));
    diffDecorationIds.set(editor, remaining);
  }

  // Revert the content
  if (change.type === 'add') {
    // Remove the added lines
    const range = new monaco.Range(
      change.startLine,
      1,
      change.endLine + 1,
      1,
    );
    model.applyEdits([{
      range,
      text: '',
    }]);
  } else if (change.type === 'remove') {
    // Restore the deleted lines
    const range = new monaco.Range(
      change.startLine,
      1,
      change.startLine,
      1,
    );
    model.applyEdits([{
      range,
      text: change.originalContent + '\n',
    }]);
  }

  // Remove from tracking
  trackedChanges.delete(changeId);

  // Fire event
  window.dispatchEvent(
    new CustomEvent('vibecode:change-rejected', {
      detail: { changeId, type: change.type },
    }),
  );
}

/**
 * Get all tracked changes for the editor.
 */
export function getTrackedChangesList(
  editor: MonacoEditor.ICodeEditor,
): TrackedChange[] {
  const trackedChanges = trackedChangesMap.get(editor);
  if (!trackedChanges) return [];
  return Array.from(trackedChanges.values());
}

/**
 * Accept all tracked changes.
 */
export function acceptAllChanges(
  editor: MonacoEditor.ICodeEditor,
): void {
  const changes = getTrackedChangesList(editor);
  for (const change of changes) {
    acceptChange(editor, change.id);
  }
}

/**
 * Reject all tracked changes.
 */
export function rejectAllChanges(
  editor: MonacoEditor.ICodeEditor,
): void {
  // Reject in reverse order to preserve line numbers
  const changes = getTrackedChangesList(editor).reverse();
  for (const change of changes) {
    rejectChange(editor, change.id);
  }
}

// ─── 8. Smart Scrolling ──────────────────────────────────────

/**
 * Smoothly scroll to the first diff/edit region in the editor.
 */
export function scrollToEdit(editor: MonacoEditor.ICodeEditor): void {
  const model = editor.getModel();
  if (!model) return;

  // Look for tracked changes first (most reliable)
  const trackedChanges = trackedChangesMap.get(editor);
  if (trackedChanges && trackedChanges.size > 0) {
    const firstChange = trackedChanges.values().next().value;
    if (firstChange) {
      editor.revealLineInCenter(firstChange.startLine, monaco.editor.ScrollType.Smooth);
      return;
    }
  }

  // Fall back to scanning decorations by CSS class
  const allDecorations = model.getAllDecorations();
  const aiDecoration = allDecorations.find(
    (d) =>
      d.options.className === CSS_CLASSES.DIFF_ADD_BG ||
      d.options.className === CSS_CLASSES.DIFF_REMOVE_BG ||
      d.options.className === CSS_CLASSES.EDIT_REGION_BG ||
      d.options.className === CSS_CLASSES.EXECUTION_LINE,
  );

  if (aiDecoration) {
    editor.revealLineInCenter(aiDecoration.range.startLineNumber, monaco.editor.ScrollType.Smooth);
  }
}

// ─── 9. Convenience: Clear All AI Decorations ────────────────

/**
 * Remove all VibeCode AI decorations from the editor.
 */
export function clearAllAIDecorations(
  editor: MonacoEditor.ICodeEditor,
): void {
  clearInlineDiffs(editor);
  clearGhostText(editor);
  clearEditRegion(editor);
  clearExecutionHighlight(editor);
  clearAIDiagnostics(editor);
}

// ─── 10. Editor Integration Hook ────────────────────────────

/**
 * Attach the full AI integration to a Monaco editor instance.
 * Returns a cleanup function that removes all decorations and listeners.
 *
 * Note: The editor parameter should be an IStandaloneCodeEditor for
 * full code action support (context menu items, command palette).
 */
export function attachAIIntegration(
  editor: MonacoEditor.ICodeEditor,
): {
  dispose: () => void;
  codeActions: monaco.IDisposable;
} {
  ensureStylesInjected();

  // Register code actions (per-editor instance)
  const codeActions = registerAICodeActions(editor);

  // Set up glyph margin for gutter icons
  editor.updateOptions({
    glyphMargin: true,
  });

  return {
    codeActions,
    dispose() {
      clearAllAIDecorations(editor);
      codeActions.dispose();
    },
  };
}
