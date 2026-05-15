// ─── VibeCode Desktop — Streaming AI Editor Integration ────────────────────────
// ARC 20 P0-3: Inline AI UX — streaming edits, inline reasoning,
//              region-level accept/reject, contextual refactor suggestions
//
// Upgrades Monaco into a true AI editing experience where editing
// feels conversational — not like reviewing a diff.
// ──────────────────────────────────────────────────────────────────────────────

import * as monaco from 'monaco-editor';
import type { editor as MonacoEditor } from 'monaco-editor';

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING EDIT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/** A streaming edit — AI writes code character by character into the editor */
export interface StreamingEdit {
  /** Unique ID */
  id: string;
  /** Target file path */
  filePath: string;
  /** Region being edited */
  region: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  /** Content accumulated so far */
  accumulatedContent: string;
  /** Whether streaming is complete */
  isComplete: boolean;
  /** Reasoning shown to the user */
  reasoning?: string;
  /** Decoration IDs for visual feedback */
  decorationIds: string[];
  /** Whether user has accepted */
  accepted: boolean;
  /** Whether user has rejected */
  rejected: boolean;
  /** Original content (for rejection/revert) */
  originalContent: string;
}

/** Inline reasoning summary shown in the editor gutter */
export interface InlineReasoning {
  /** Line where the reasoning appears */
  line: number;
  /** Short summary (1-2 sentences) */
  summary: string;
  /** Full reasoning (shown on hover) */
  detail: string;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

/** Contextual refactor suggestion */
export interface RefactorSuggestion {
  /** Region to refactor */
  region: {
    startLine: number;
    endLine: number;
  };
  /** Suggestion title */
  title: string;
  /** Brief description */
  description: string;
  /** Preview of the refactored code */
  preview: string;
  /** Type of refactor */
  type: 'extract' | 'inline' | 'rename' | 'simplify' | 'optimize' | 'type-fix';
  /** Estimated impact */
  impact: 'low' | 'medium' | 'high';
}

// ─── CSS Classes for streaming decorations ───────────────────────────────

const STREAM_CSS = {
  STREAMING_LINE: 'vibecode-streaming-line',
  STREAMING_CURSOR: 'vibecode-streaming-cursor',
  STREAMING_REASONING: 'vibecode-streaming-reasoning',
  REFACTOR_SUGGESTION: 'vibecode-refactor-suggestion',
  INLINE_REASONING_GUTTER: 'vibecode-inline-reasoning-gutter',
  AI_EDIT_ACCEPTED: 'vibecode-ai-edit-accepted',
  AI_EDIT_REJECTED: 'vibecode-ai-edit-rejected',
};

let streamStylesInjected = false;

function ensureStreamStylesInjected(): void {
  if (streamStylesInjected) return;
  streamStylesInjected = true;

  const styleEl = document.createElement('style');
  styleEl.id = 'vibecode-streaming-styles';
  styleEl.textContent = `
    /* ── Streaming Edit Animations ── */
    .${STREAM_CSS.STREAMING_LINE} {
      background-color: rgba(99, 102, 241, 0.06) !important;
      border-left: 2px solid rgba(99, 102, 241, 0.6) !important;
    }
    .${STREAM_CSS.STREAMING_CURSOR} {
      display: inline-block;
      width: 2px;
      height: 1em;
      background-color: #6366f1;
      animation: vibecodeBlink 1s step-end infinite;
      vertical-align: text-bottom;
    }
    .${STREAM_CSS.STREAMING_REASONING} {
      color: rgba(99, 102, 241, 0.7);
      font-size: 11px;
      font-style: italic;
      padding-left: 4px;
    }

    /* ── Refactor Suggestion ── */
    .${STREAM_CSS.REFACTOR_SUGGESTION} {
      background-color: rgba(34, 197, 94, 0.04) !important;
      border-left: 2px solid rgba(34, 197, 94, 0.3) !important;
    }
    .${STREAM_CSS.INLINE_REASONING_GUTTER} {
      background-color: rgba(99, 102, 241, 0.4);
      border-radius: 50%;
      width: 8px !important;
      height: 8px !important;
      margin-left: 3px;
      margin-top: 6px;
      cursor: pointer;
    }

    /* ── Accept/Reject States ── */
    .${STREAM_CSS.AI_EDIT_ACCEPTED} {
      background-color: rgba(34, 197, 94, 0.08) !important;
      border-left: 2px solid rgba(34, 197, 94, 0.5) !important;
    }
    .${STREAM_CSS.AI_EDIT_REJECTED} {
      background-color: rgba(239, 68, 68, 0.06) !important;
      border-left: 2px solid rgba(239, 68, 68, 0.3) !important;
      text-decoration: line-through;
      opacity: 0.5;
    }

    @keyframes vibecodeBlink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

// ─── Streaming Edit Manager ──────────────────────────────────────────────

/** Map of editor → active streaming edits */
const activeStreamingEdits = new WeakMap<MonacoEditor.ICodeEditor, Map<string, StreamingEdit>>();

function getStreamingEdits(editor: MonacoEditor.ICodeEditor): Map<string, StreamingEdit> {
  let map = activeStreamingEdits.get(editor);
  if (!map) {
    map = new Map();
    activeStreamingEdits.set(editor, map);
  }
  return map;
}

/**
 * Start a streaming edit — AI code appears character by character in the editor.
 * This is the core of the "conversational editing" experience.
 */
export function startStreamingEdit(
  editor: MonacoEditor.ICodeEditor,
  filePath: string,
  region: StreamingEdit['region'],
  originalContent: string,
  reasoning?: string,
): StreamingEdit {
  ensureStreamStylesInjected();

  const id = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const streamingEdit: StreamingEdit = {
    id,
    filePath,
    region,
    accumulatedContent: '',
    isComplete: false,
    reasoning,
    decorationIds: [],
    accepted: false,
    rejected: false,
    originalContent,
  };

  // Highlight the region being edited
  const decorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(region.startLine, 1, region.endLine, 1),
      options: {
        isWholeLine: true,
        className: STREAM_CSS.STREAMING_LINE,
        linesDecorationsClassName: STREAM_CSS.INLINE_REASONING_GUTTER,
        glyphMarginHoverMessage: reasoning
          ? { value: `**AI Reasoning**: ${reasoning}` }
          : undefined,
      },
    },
  ];

  // Add reasoning line above if present
  if (reasoning) {
    decorations.push({
      range: new monaco.Range(region.startLine, 1, region.startLine, 1),
      options: {
        after: {
          content: ` // ${reasoning.slice(0, 80)}${reasoning.length > 80 ? '...' : ''}`,
          inlineClassName: STREAM_CSS.STREAMING_REASONING,
        },
      },
    });
  }

  const ids = editor.deltaDecorations([], decorations);
  streamingEdit.decorationIds = ids;

  const edits = getStreamingEdits(editor);
  edits.set(id, streamingEdit);

  // Fire event
  window.dispatchEvent(
    new CustomEvent('vibecode:streaming-start', {
      detail: { editId: id, filePath, region, reasoning },
    }),
  );

  return streamingEdit;
}

/**
 * Append content to a streaming edit — called as AI tokens arrive.
 * This progressively fills in the code in the editor.
 */
export function appendStreamingContent(
  editor: MonacoEditor.ICodeEditor,
  editId: string,
  content: string,
): void {
  const edits = getStreamingEdits(editor);
  const edit = edits.get(editId);
  if (!edit || edit.isComplete || edit.accepted || edit.rejected) return;

  edit.accumulatedContent += content;

  const model = editor.getModel();
  if (!model) return;

  // Apply the content progressively
  const currentLength = edit.accumulatedContent.length;
  const newContent = edit.accumulatedContent;

  // Replace the region with accumulated content
  model.applyEdits([{
    range: new monaco.Range(
      edit.region.startLine,
      edit.region.startCol,
      edit.region.endLine,
      edit.region.endCol,
    ),
    text: newContent,
  }]);

  // Update the region end position based on content
  const lines = newContent.split('\n');
  edit.region.endLine = edit.region.startLine + lines.length - 1;
  edit.region.endCol = lines.length > 1
    ? lines[lines.length - 1].length + 1
    : edit.region.startCol + newContent.length;

  // Update decorations to cover the new range
  const newDecorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(edit.region.startLine, 1, edit.region.endLine, 1),
      options: {
        isWholeLine: true,
        className: STREAM_CSS.STREAMING_LINE,
        linesDecorationsClassName: STREAM_CSS.INLINE_REASONING_GUTTER,
      },
    },
  ];

  editor.deltaDecorations(edit.decorationIds, newDecorations);
  edit.decorationIds = editor.deltaDecorations([], newDecorations);

  // Scroll to keep the streaming content in view
  editor.revealLineInCenter(edit.region.endLine, monaco.editor.ScrollType.Smooth);
}

/**
 * Complete a streaming edit — the AI has finished writing.
 */
export function completeStreamingEdit(
  editor: MonacoEditor.ICodeEditor,
  editId: string,
): void {
  const edits = getStreamingEdits(editor);
  const edit = edits.get(editId);
  if (!edit) return;

  edit.isComplete = true;

  // Update decoration to show completion
  const completionDecorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(edit.region.startLine, 1, edit.region.endLine, 1),
      options: {
        isWholeLine: true,
        className: STREAM_CSS.AI_EDIT_ACCEPTED,
        glyphMarginHoverMessage: {
          value: '**AI Edit Complete** — Accept (✓) or Reject (✗)',
        },
      },
    },
  ];

  editor.deltaDecorations(edit.decorationIds, completionDecorations);

  window.dispatchEvent(
    new CustomEvent('vibecode:streaming-complete', {
      detail: { editId, filePath: edit.filePath, content: edit.accumulatedContent },
    }),
  );
}

/**
 * Accept a streaming edit — keep the changes.
 */
export function acceptStreamingEdit(
  editor: MonacoEditor.ICodeEditor,
  editId: string,
): void {
  const edits = getStreamingEdits(editor);
  const edit = edits.get(editId);
  if (!edit) return;

  edit.accepted = true;

  // Clear streaming decorations
  editor.deltaDecorations(edit.decorationIds, []);

  // Briefly flash green
  const flashDecorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(edit.region.startLine, 1, edit.region.endLine, 1),
      options: {
        isWholeLine: true,
        className: STREAM_CSS.AI_EDIT_ACCEPTED,
      },
    },
  ];

  const flashIds = editor.deltaDecorations([], flashDecorations);

  // Remove the green flash after 1 second
  setTimeout(() => {
    editor.deltaDecorations(flashIds, []);
  }, 1000);

  edits.delete(editId);

  window.dispatchEvent(
    new CustomEvent('vibecode:streaming-accepted', {
      detail: { editId, filePath: edit.filePath },
    }),
  );
}

/**
 * Reject a streaming edit — revert to original content.
 */
export function rejectStreamingEdit(
  editor: MonacoEditor.ICodeEditor,
  editId: string,
): void {
  const edits = getStreamingEdits(editor);
  const edit = edits.get(editId);
  if (!edit) return;

  edit.rejected = true;

  // Revert the content
  const model = editor.getModel();
  if (model) {
    model.applyEdits([{
      range: new monaco.Range(
        edit.region.startLine,
        edit.region.startCol,
        edit.region.endLine,
        edit.region.endCol,
      ),
      text: edit.originalContent,
    }]);
  }

  // Clear decorations
  editor.deltaDecorations(edit.decorationIds, []);

  // Briefly flash red
  const flashDecorations: MonacoEditor.IModelDeltaDecoration[] = [
    {
      range: new monaco.Range(edit.region.startLine, 1, edit.region.startLine, 1),
      options: {
        isWholeLine: true,
        className: STREAM_CSS.AI_EDIT_REJECTED,
      },
    },
  ];

  const flashIds = editor.deltaDecorations([], flashDecorations);
  setTimeout(() => {
    editor.deltaDecorations(flashIds, []);
  }, 500);

  edits.delete(editId);

  window.dispatchEvent(
    new CustomEvent('vibecode:streaming-rejected', {
      detail: { editId, filePath: edit.filePath },
    }),
  );
}

// ─── Inline Reasoning Display ───────────────────────────────────────────

/**
 * Show inline reasoning annotations in the editor.
 * These appear as subtle annotations near AI-edited regions,
 * explaining WHY the AI made each change.
 */
export function showInlineReasoning(
  editor: MonacoEditor.ICodeEditor,
  reasoning: InlineReasoning[],
): string[] {
  ensureStreamStylesInjected();

  const decorations: MonacoEditor.IModelDeltaDecoration[] = reasoning.map((r) => {
    const confidenceIcon =
      r.confidence === 'high' ? '✓' :
      r.confidence === 'medium' ? '~' : '?';

    return {
      range: new monaco.Range(r.line, 1, r.line, 1),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: STREAM_CSS.INLINE_REASONING_GUTTER,
        glyphMarginHoverMessage: {
          value: `**AI Reasoning** (${confidenceIcon}):\n${r.detail}`,
        },
        after: {
          content: ` // ${r.summary}`,
          inlineClassName: STREAM_CSS.STREAMING_REASONING,
        },
      },
    };
  });

  return editor.deltaDecorations([], decorations);
}

// ─── Refactor Suggestions ────────────────────────────────────────────────

/**
 * Show contextual refactor suggestions in the editor.
 * These appear as subtle highlights with hover explanations.
 */
export function showRefactorSuggestions(
  editor: MonacoEditor.ICodeEditor,
  suggestions: RefactorSuggestion[],
): string[] {
  ensureStreamStylesInjected();

  const decorations: MonacoEditor.IModelDeltaDecoration[] = suggestions.map((s) => {
    const impactIcon =
      s.impact === 'high' ? '⚡' :
      s.impact === 'medium' ? '🔧' : '💡';

    return {
      range: new monaco.Range(s.region.startLine, 1, s.region.endLine, 1),
      options: {
        isWholeLine: true,
        className: STREAM_CSS.REFACTOR_SUGGESTION,
        glyphMarginHoverMessage: {
          value: [
            `**${impactIcon} ${s.title}**`,
            '',
            s.description,
            '',
            '```',
            s.preview.slice(0, 200),
            '```',
          ].join('\n'),
        },
        overviewRuler: {
          color: '#22c55e50',
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    };
  });

  return editor.deltaDecorations([], decorations);
}

// ─── Live Code Explanations ─────────────────────────────────────────────

/**
 * Add live code explanations — hover-activated annotations
 * that explain what a section of code does.
 */
export function addCodeExplanations(
  editor: MonacoEditor.ICodeEditor,
  explanations: Array<{
    startLine: number;
    endLine: number;
    explanation: string;
  }>,
): string[] {
  const decorations: MonacoEditor.IModelDeltaDecoration[] = explanations.map((e) => ({
    range: new monaco.Range(e.startLine, 1, e.endLine, 1),
    options: {
      isWholeLine: true,
      glyphMarginHoverMessage: {
        value: `**AI Explanation**:\n${e.explanation}`,
      },
      overviewRuler: {
        color: '#6366f130',
        position: monaco.editor.OverviewRulerLane.Right,
      },
    },
  }));

  return editor.deltaDecorations([], decorations);
}

// ─── Region-Level Accept/Reject ─────────────────────────────────────────

/**
 * Set up keyboard shortcuts for region-level accept/reject.
 * Ctrl+Enter = accept current AI edit, Ctrl+Backspace = reject.
 */
export function setupRegionAcceptReject(
  editor: MonacoEditor.ICodeEditor,
): monaco.IDisposable {
  const acceptAction = (editor as MonacoEditor.IStandaloneCodeEditor).addAction({
    id: 'vibecode.acceptAIEdit',
    label: 'Accept AI Edit',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => {
      const edits = getStreamingEdits(editor);
      // Accept the most recent streaming edit near the cursor
      const position = editor.getPosition();
      if (!position) return;

      for (const [editId, edit] of edits) {
        if (position.lineNumber >= edit.region.startLine &&
            position.lineNumber <= edit.region.endLine &&
            edit.isComplete && !edit.accepted && !edit.rejected) {
          acceptStreamingEdit(editor, editId);
          return;
        }
      }

      // If no streaming edit, accept the current tracked change
      window.dispatchEvent(new CustomEvent('vibecode:accept-current'));
    },
  });

  const rejectAction = (editor as MonacoEditor.IStandaloneCodeEditor).addAction({
    id: 'vibecode.rejectAIEdit',
    label: 'Reject AI Edit',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backspace],
    run: () => {
      const edits = getStreamingEdits(editor);
      const position = editor.getPosition();
      if (!position) return;

      for (const [editId, edit] of edits) {
        if (position.lineNumber >= edit.region.startLine &&
            position.lineNumber <= edit.region.endLine &&
            edit.isComplete && !edit.accepted && !edit.rejected) {
          rejectStreamingEdit(editor, editId);
          return;
        }
      }

      window.dispatchEvent(new CustomEvent('vibecode:reject-current'));
    },
  });

  return {
    dispose() {
      acceptAction.dispose();
      rejectAction.dispose();
    },
  };
}

/**
 * Get all active streaming edits for an editor.
 */
export function getActiveStreamingEdits(
  editor: MonacoEditor.ICodeEditor,
): StreamingEdit[] {
  const edits = getStreamingEdits(editor);
  return Array.from(edits.values());
}

/**
 * Clear all streaming edits from an editor.
 */
export function clearAllStreamingEdits(
  editor: MonacoEditor.ICodeEditor,
): void {
  const edits = getStreamingEdits(editor);
  for (const [editId, edit] of edits) {
    editor.deltaDecorations(edit.decorationIds, []);
  }
  edits.clear();
}
