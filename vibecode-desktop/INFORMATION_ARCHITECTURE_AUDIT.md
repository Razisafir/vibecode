# VibeCode Desktop — Information Architecture Audit

> **ARC 7 Phase 7 — Information Architecture**
> Comprehensive audit of duplicated concepts, confusing terminology, overloaded menus, misplaced settings, and hidden critical actions.

---

## Executive Summary

VibeCode Desktop has grown organically through rapid development, resulting in several information architecture issues that affect discoverability, increase cognitive load, and create inconsistency between user-facing language and internal state. This audit identifies 6 categories of IA problems and provides actionable recommendations. Several issues have already been resolved in earlier ARC 7 phases (3–6); remaining issues are marked for future resolution.

---

## 1. Duplicated Concepts

### 1.1 Toggle Switch Implementations (Resolved)

**Before ARC 7 Phase 5:** Toggle switches were implemented inline in 5 separate locations — 2 in `Onboarding.tsx` and 3 in `SettingsPanel.tsx`. Each instance used slightly different markup patterns, inconsistent label/description pairing, and varying sizing. Users could not predict toggle behavior because the visual language was inconsistent.

**Resolution:** A shared `<Toggle>` component was extracted in Phase 5, replacing all 5 inline implementations. The component now provides consistent `enabled`/`onChange`/`label`/`description` props.

### 1.2 Section Header Implementations (Resolved)

**Before ARC 7 Phase 5:** Section headers in `SettingsPanel.tsx` were duplicated 5 times with varying font sizes, spacing, and capitalization. Some used `text-xs font-semibold uppercase tracking-wider`, others used `text-sm font-medium`. This inconsistency made the settings panel feel fragmented.

**Resolution:** A shared `<SectionHeader>` component was extracted, providing uniform styling via a single `title` prop.

### 1.3 Spinner Implementations (Partially Resolved)

Two distinct spinner patterns coexist: the CSS class `.spinner` / `.spinner-sm` used for loading states, and inline Tailwind spin animations (`animate-spin` with border tricks) used for step status icons and retry/rollback buttons. While functionally similar, they produce visually different spinners — the CSS spinner is a lighter, bordered circle, while the Tailwind variant is a heavier filled ring. These should be unified into a single `<Spinner>` component.

---

## 2. Terminology Issues

### 2.1 "Rollback" vs "Undo" (Resolved)

**Before ARC 7 Phase 3:** The execution system used "rollback" consistently — the IPC channel is `execution.rollbackPlan`, the button label was "Rollback Changes", and the confirmation said "Confirm Rollback." The term "rollback" carries database/administrative connotations that feel intimidating to non-expert users.

**Resolution:** All user-facing text was changed to "undo" — "Undo Changes," "Undo these changes?", "Yes, Undo." The internal IPC channel name remains `rollbackPlan` for backward compatibility, but this should be aliased or renamed in a future API migration.

### 2.2 "Rollbackable" vs "Reversible" (Resolved)

**Before ARC 7 Phase 3:** The proposal badge displayed "rollbackable" — a non-standard English word that combined jargon with an awkward suffix.

**Resolution:** Changed to "reversible," a standard English word that communicates the same concept without technical connotation.

### 2.3 "Proposal" vs "Plan" (Unresolved — Still Ambiguous)

The codebase uses both "proposal" and "plan" to refer to the same concept — a set of steps the AI suggests executing. The type system uses `ProposalCard` / `ProposalCardData`, but the execution engine uses `planId` and `rollbackPlan`. The `TYPE_LABELS` map includes both `plan` and `multi_step` as separate entries, but the semantic difference is unclear:

- `plan: 'Plan'` — A step type label
- `multi_step: 'Multi-Step Plan'` — Another step type label

When a user sees "Plan" vs "Multi-Step Plan," the distinction is not meaningful. Internally, `planId` is the identifier that ties a proposal to its execution, but the naming creates confusion between the UI concept (a proposal for the user to review) and the execution concept (a plan to be carried out).

**Recommendation:** Standardize on "proposal" for user-facing language (the thing the user reviews) and "execution plan" for internal/engineering language (the thing the engine runs). Merge `plan` and `multi_step` type labels into a single "Multi-Step" label.

### 2.4 Type Label Confusion

The `TYPE_LABELS` mapping in `ProposalCard.tsx` contains 13 entries, many of which overlap:

| Internal Type | Display Label | Overlap |
|---------------|--------------|---------|
| `file_write` | Write File | Similar to `file_create` |
| `file_create` | New File | Similar to `file_write` |
| `file_edit` | Edit File | Similar to `code_edit` |
| `code_edit` | Edit Code | Same as `file_edit` |
| `code_generation` | Generate Code | Similar to `generation` |
| `generation` | Generate | Same as `code_generation` |

Users should not need to distinguish between "Write File" and "New File" or "Edit File" and "Edit Code." These distinctions are implementation artifacts from different executor types, not meaningful user-facing categories.

**Recommendation:** Consolidate to 5 user-facing labels: "New File," "Edit File," "Remove File," "Run Command," and "Multi-Step."

---

## 3. Settings Organization

### 3.1 Provider Settings Duplication

Provider configuration exists in both `Onboarding.tsx` (step 2, "Connect Your AI Provider") and `SettingsPanel.tsx` (AI Providers section). Both surfaces expose:

- Provider type selection (OpenAI, Anthropic, Google, Ollama, LM Studio)
- API key input
- Base URL configuration
- Model selection
- Temperature / max tokens / streaming toggles

The Onboarding flow provides a streamlined version (grid of provider cards, single API key field), while SettingsPanel provides the full management surface (add/remove/test/set active/set fallback). However, a user who configures a provider during onboarding then navigates to Settings may be confused about which configuration is canonical.

**Recommendation:** Onboarding should be clearly positioned as "quick setup" that writes to the same provider store that SettingsPanel reads from. Add a link in SettingsPanel: "Providers configured during setup" when a provider was created via Onboarding. Ensure both surfaces share the same `PROVIDER_TYPES` definition rather than duplicating them.

### 3.2 Workspace Path Duplication

The workspace path can be set in both Onboarding (step 4, "Set Up Your Workspace") and SettingsPanel (Workspace section). These write to different state (`Onboarding` local state vs `SettingsPanel` local state) and it is unclear whether changes in one propagate to the other.

**Recommendation:** Use a shared hook (e.g., `useWorkspacePath()`) that reads from and writes to a single source of truth, so both surfaces always reflect the current workspace.

### 3.3 Model Configuration Duplication

Model configuration (temperature, max tokens, streaming, model selection) appears in Onboarding step 3 and in the expanded provider section of SettingsPanel. The Onboarding version saves via `provider.setChatOptions()` during the step transition, while SettingsPanel saves immediately via the same API on each change. This creates different save semantics (batch vs immediate) for the same settings.

**Recommendation:** Unify save behavior. Both surfaces should use the same "save on change" pattern with debouncing.

---

## 4. Hidden Actions

### 4.1 Undo Is Only Visible After Execution

The "Undo Changes" button only appears when a proposal has `status === 'completed' || status === 'failed'` AND `canRollback === true`. During the critical decision-making moment (when the proposal is `pending`), there is no indication that undo will be available after execution — only the small "reversible" badge and the "What Will Happen" summary mention it. Users who are afraid of making irreversible changes may reject proposals unnecessarily.

**Resolution (Partial):** The "What Will Happen" section added in Phase 3 now includes "You can undo all changes after they are applied" for reversible proposals. However, this text is small and easily missed.

**Recommendation:** Make undo availability more prominent — consider a persistent "Undo available" indicator in the proposal card header area, not just in the expandable summary.

### 4.2 Retry Is Only Visible on Failure

The "Try Again" button only appears when `status === 'failed'`. Users cannot retry a partially successful execution where some steps completed and one failed. Additionally, the retry mechanism only retries the first failed step, not all failed steps, which is not communicated to the user.

**Recommendation:** Allow retry from the step timeline (per-step retry), and show a count of failed steps when multiple exist.

### 4.3 Step Output Behind "View Output" Link

Command step output is accessible only through a small "View output" link that appears after step completion. This link uses `text-2xs text-accent` styling — one of the smallest interactive elements in the UI. For debugging workflows, viewing command output is essential, but the affordance is nearly invisible.

**Recommendation:** Auto-expand output for failed steps. Increase the tap target size for the "View output" link. Consider showing a truncated preview inline.

---

## 5. Menu and Navigation Issues

### 5.1 Command Palette Discoverability

The command palette (Cmd+K) is the primary power-user navigation mechanism, but it is completely undiscoverable. There is no visual indicator anywhere in the UI that it exists. The onboarding "ready" step mentions "Use Cmd+K for quick actions," but this is a single line in a list of 4 suggestions that the user is likely to skim past.

**Recommendation:** Add a search icon or "Cmd+K" hint in the title bar or a prominent location. Consider a first-run tooltip that highlights the command palette.

### 5.2 Sidebar Tabs Lack Keyboard Shortcuts

The sidebar activity bar shows 4 icons (Files, Terminal, Memory, Settings) but provides no keyboard shortcut hints. The command palette reveals that `Cmd+B` toggles the sidebar and `Cmd+`` toggles the terminal, but these are invisible in the sidebar itself.

**Recommendation:** Add tooltip labels with keyboard shortcuts to sidebar icons (e.g., "Files (Cmd+Shift+E)" or similar standard bindings).

### 5.3 Memory Panel Hard to Find

The Memory panel is buried as the third tab in the sidebar, with only a clock icon to distinguish it. Users who want to view or manage their project's AI memory (stored decisions, context summaries) must know to click an unlabeled clock icon in the sidebar. The Memory panel is also one of VibeCode's differentiating features, making its low discoverability a product problem.

**Recommendation:** Add a Memory indicator in the AI panel header (e.g., "3 memories stored") with a click-through to the Memory panel. Consider promoting Memory to a top-level UI element rather than a sidebar tab.

---

## 6. Recommendations Summary

| Priority | Issue | Recommendation | Effort |
|----------|-------|----------------|--------|
| High | Provider settings duplication | Share `PROVIDER_TYPES` definition; link Onboarding ↔ Settings | Small |
| High | Workspace path duplication | Create shared `useWorkspacePath()` hook | Small |
| High | "Proposal" vs "Plan" ambiguity | Standardize terminology; consolidate type labels | Medium |
| High | Command palette discoverability | Add Cmd+K hint in title bar or prominent location | Small |
| Medium | Undo not prominent enough | Add persistent "Undo available" indicator | Small |
| Medium | Retry limited to single step | Allow per-step retry in timeline | Medium |
| Medium | Memory panel hard to find | Add AI panel memory link; consider promotion | Medium |
| Medium | Spinner duplication | Create shared `<Spinner>` component | Small |
| Low | Type label overlap (13→5) | Consolidate to 5 user-facing labels | Small |
| Low | Sidebar keyboard shortcuts | Add shortcut hints to tooltips | Small |
| Low | Model config save semantics | Unify batch vs immediate save | Medium |
| Low | Step output visibility | Auto-expand for failures; increase tap target | Small |

---

## Audit Method

This audit was performed by code inspection of the VibeCode Desktop codebase, focusing on:

- Component files in `src/renderer/components/`
- Type definitions in `src/renderer/types/`
- IPC handler naming in `src/main/ipc/`
- Service naming in `src/main/services/`
- Prior ARC 7 work documented in `worklog.md`

Findings are cross-referenced with changes already made in ARC 7 Phases 3–6 to avoid redundant recommendations.
