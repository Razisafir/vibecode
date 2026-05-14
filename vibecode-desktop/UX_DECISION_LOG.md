# VibeCode Desktop — UX Decision Log

> **ARC 7 Phases 3–8 — Record of Key UX Decisions**
> Each decision documents what was chosen, what alternatives were considered, and the rationale.

---

## Decision 1: Use "Undo" Instead of "Rollback"

**Date:** ARC 7 Phase 3
**Context:** The execution system's revert mechanism was labeled "rollback" in all user-facing text — button labels, confirmation dialogs, and badge text. The internal IPC channel is named `rollbackPlan`.

**Alternatives Considered:**
- **"Rollback"** — Technically precise, familiar to database administrators and DevOps engineers. Carries connotations of transactional integrity and system-level operations.
- **"Revert"** — Common in version control (git revert). Neutral tone, widely understood by developers.
- **"Undo"** — Universal computing concept. Every user understands "undo" from text editors, file managers, and browsers.

**Decision:** "Undo"

**Rationale:** VibeCode's brand positioning is "calm, intelligent engineering partner." The term "rollback" creates unnecessary anxiety — it sounds like something has gone wrong at a system level, requiring an administrative intervention. "Undo" is the most universally understood term for reversing an action, and it implies a lightweight, confident operation. Users who see "Undo Changes" feel empowered to experiment, while users who see "Rollback Changes" feel they are performing a recovery operation. The semantic difference matters for trust-building: undo is a feature, rollback is an emergency procedure.

**Internal API Note:** The IPC channel `execution.rollbackPlan` was retained for backward compatibility. A future API migration should alias this to `execution.undoPlan` with a deprecation period.

---

## Decision 2: Replace Tiny Fonts with Minimum 10px

**Date:** ARC 7 Phase 3
**Context:** Multiple UI elements used `text-[9px]`, `text-[10px]`, and `text-[11px]` — arbitrary pixel values that fell below VibeCode's type scale. These appeared in risk level badges, step type labels, model name chips, and diff line metadata.

**Alternatives Considered:**
- **Keep sub-10px sizes** — Maximizes information density. Common in developer tools that optimize for screen real estate.
- **Enforce 12px minimum** — Standard accessibility recommendation. Ensures all text is clearly legible.
- **Introduce `text-2xs` (10px) as floor** — Balances information density with readability. Allows micro-labels that are still legible.

**Decision:** Introduce `text-2xs` (10px / 14px line-height) as the minimum, replacing all 9px and 10px instances.

**Rationale:** A 9px font on a dark background with muted color contrast is genuinely unreadable for many users, especially on non-Retina displays or when the window is not at 100% zoom. However, jumping to a 12px minimum would eliminate the ability to show metadata like step types, risk badges, and file counts — information that adds valuable context without requiring user action. The 10px floor preserves information density while ensuring all text meets a minimum legibility threshold. The `text-2xs` token formalizes this decision so future contributors cannot accidentally use sub-10px values.

---

## Decision 3: Add "What Will Happen" Summaries

**Date:** ARC 7 Phase 3
**Context:** When a proposal is in "pending" state, the user must decide whether to approve it. Previously, the only information was the proposal title, description, risk level, and a "Show details" button. Users had to expand the details, navigate to the Steps tab, and mentally reconstruct what would happen — a high-friction decision process.

**Alternatives Considered:**
- **No summary** — Force users to engage with details. Prevents "blind approval" by making the approval path harder.
- **Full step list always visible** — Show all steps inline without expansion. Maximum transparency, but visually overwhelming for multi-step proposals.
- **Summary + undo reassurance** — A concise natural-language summary of what will happen, plus a reminder that undo is available.

**Decision:** Summary + undo reassurance ("What Will Happen" section)

**Rationale:** Trust is built through clarity, not through forced engagement. Users who want to review every step can still expand the details, but users who trust the AI's description should be able to approve quickly with confidence. The "What Will Happen" section serves two purposes: (1) it provides a scannable summary so the user can make an informed decision without drilling into details, and (2) it explicitly states that undo is available, reducing decision anxiety. This is especially important for VibeCode's target audience — developers who want to move fast but need to feel safe doing so. The summary reads naturally ("This will run 3 steps: Edit config, Add route, Update tests") rather than presenting a raw list.

---

## Decision 4: Use "Reversible" Instead of "Rollbackable"

**Date:** ARC 7 Phase 3
**Context:** Proposals that could be undone displayed a badge reading "rollbackable" — a non-standard English word.

**Alternatives Considered:**
- **"Rollbackable"** — Directly derived from the internal "rollback" mechanism. Precise but awkward.
- **"Undoable"** — Clear and simple, but sounds informal and can be confused with "un-doable" (not possible to do).
- **"Reversible"** — Standard English word. Neutral, professional, and unambiguous.

**Decision:** "Reversible"

**Rationale:** "Rollbackable" is not a word in any dictionary, and its construction (noun + "-able") creates cognitive friction. "Undoable" has a homophone problem — "undoable" can mean "cannot be done," which is the opposite of the intended meaning. "Reversible" is a real word that precisely conveys "can be reversed" without ambiguity or jargon. It also aligns with the broader terminology shift from "rollback" to "undo" — if the action is "undo," the property is "reversible."

---

## Decision 5: Standardize on Semantic Color Tokens

**Date:** ARC 7 Phase 1 (Design System Unification)
**Context:** Before ARC 7, colors were applied using a mix of Tailwind arbitrary values (`text-[#ef4444]`), raw CSS hex colors, and inconsistent semantic names. There was no consistent mapping between colors and their meaning.

**Alternatives Considered:**
- **Keep ad-hoc colors** — Maximum flexibility for each component. No abstraction overhead.
- **Full theme system** — Support light/dark mode switching with CSS variable overrides. Comprehensive but high implementation cost.
- **Semantic tokens only** — Define a fixed set of purpose-named tokens (success, warning, error, info, accent) that map to specific colors. Single dark theme, no light mode.

**Decision:** Semantic tokens only (with full CSS variable + Tailwind sync)

**Rationale:** Ad-hoc colors create maintenance debt — changing the error color requires finding and replacing every instance across 20+ component files. A full theme system is aspirational but premature for a single-theme application. Semantic tokens provide the right abstraction level: `text-success` always means "positive/good," `text-error` always means "negative/bad," regardless of the underlying hex value. This makes the codebase self-documenting and ensures consistency. The CSS variable + Tailwind dual-source approach means that a future light theme can be added by changing variable values without touching any component code.

---

## Decision 6: Extract Toggle and SectionHeader Components

**Date:** ARC 7 Phase 5
**Context:** Toggle switches and section headers were implemented inline in 5+ and 5+ locations respectively, with inconsistent markup patterns, spacing, and styling.

**Alternatives Considered:**
- **Inline patterns with a style guide** — Document the correct pattern and rely on contributors to follow it. Low implementation cost but fragile.
- **CSS-only standardization** — Define `.toggle` and `.section-header` CSS classes. No React component extraction.
- **React component extraction** — Create `<Toggle>` and `<SectionHeader>` components with typed props. Single source of truth.

**Decision:** React component extraction

**Rationale:** Style guides are ignored under deadline pressure. CSS classes solve visual consistency but not behavioral consistency — toggles in different locations had different state management patterns (some used `checked`, others used custom state). A React component enforces both visual AND behavioral consistency through its API surface. The `<Toggle>` component's `enabled`/`onChange`/`label`/`description` props create a contract that prevents drift. Additionally, extracted components are easier to test in isolation and to update globally when design decisions change.

---

## Decision 7: Onboarding as Trust-Building, Not Feature-Dumping

**Date:** ARC 7 Phase 6
**Context:** The onboarding "ready" step previously listed technical capabilities ("AI-native workspace," "multi-provider support," "intelligent memory"). This approach, common in developer tools, treats onboarding as a feature brochure rather than a relationship-building moment.

**Alternatives Considered:**
- **Feature showcase** — List key features with icons and descriptions. Standard approach for developer tools. Emphasizes capability.
- **Tutorial walkthrough** — Guided interaction with each feature. High engagement but high friction; users want to start working.
- **Confidence-building** — Focus on outcomes and safety. "Open a project and start coding," "All changes can be undone — experiment freely." Emphasizes trust.

**Decision:** Confidence-building approach

**Rationale:** First-time users of an AI coding tool are in a high-anxiety state. They are about to give an AI system the ability to modify their code, run commands, and create files. The primary emotion is not excitement — it is concern. Will it break my code? Can I undo mistakes? Is my API key safe? Feature-dumping exacerbates anxiety by emphasizing capability ("look at everything this AI can do to your code!") rather than safety ("you are in control"). The trust-building approach directly addresses the user's unspoken fears: "Your key is stored securely on your device," "You can always undo changes," "Your data stays on your device." These reassurances, placed strategically throughout the onboarding flow, transform the emotional arc from anxiety to confidence. A confident user engages more deeply and is more likely to explore advanced features on their own.
