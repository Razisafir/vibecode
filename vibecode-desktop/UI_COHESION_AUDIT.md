# UI Cohesion Audit — ARC 7

## Before/After: Cohesion Fixes

This document catalogs every cohesion fix applied during ARC 7, showing the before state and the after state for each change. The goal of ARC 7's cohesion work was to eliminate visual inconsistencies, remove duplicated implementations, and ensure every component in the application feels like part of the same design system.

---

## 1. Design Token Migration

### Before
Components used raw CSS values scattered across inline styles, Tailwind classes, and CSS files:
- Colors: `#0a0a0f`, `#1a1a2e`, `#2a2a3d`, `#6366f1`, `rgba(99, 102, 241, 0.15)`, etc.
- Font sizes: `text-[9px]`, `text-[10px]`, `text-[11px]` — arbitrary pixel values
- Spacing: Inconsistent padding/margin values with no scale
- Borders: Mixed `border-gray-700`, `border-gray-800`, `border-[#2a2a3d]`
- Shadows: Inconsistent `shadow-sm`, `shadow-lg`, inline shadow values

### After
All values reference CSS custom properties from the design token system:
- Colors: `var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--accent)`, etc.
- Font sizes: `text-2xs` (10px minimum), `text-xs`, `text-sm`, `text-base` — consistent scale
- Spacing: Tailwind spacing scale consistently applied
- Borders: `var(--border)` everywhere, `border-border` utility class
- Shadows: `var(--shadow-sm)`, `var(--shadow-md)`, `var(--shadow-lg)` — 4-level system

**Impact**: Eliminated ~50 raw color values, ~15 raw font sizes, and dozens of inconsistent border/shadow values. Theme changes now require updating CSS variables only, not hunting through component code.

---

## 2. Toggle Component Unification

### Before
Toggle switches were implemented 5 separate times across the codebase:
1. `Onboarding.tsx`: Custom toggle with `bg-bg-tertiary` / `bg-accent` classes and inline transition
2. `SettingsPanel.tsx` (API key visibility): Similar toggle with slightly different sizing
3. `SettingsPanel.tsx` (auto-approve): Toggle with different border radius
4. `SettingsPanel.tsx` (dark mode): Toggle with yet another size variant
5. `SettingsPanel.tsx` (compact mode): Toggle with different animation timing

Each implementation had subtle differences in size (28px vs 32px width), animation timing (150ms vs 200ms), knob size (12px vs 14px), and color handling.

### After
Single `Toggle` component in `src/renderer/components/ui/Toggle.tsx`:
- Consistent dimensions: 36px width × 20px height, 16px knob
- Consistent animation: `transition-all 150ms ease`
- Consistent colors: `var(--bg-tertiary)` off, `var(--accent)` on, `var(--text-primary)` knob
- Proper accessibility: `role="switch"`, `aria-checked`, keyboard support
- All 5 instances replaced with `<Toggle checked={...} onChange={...} />`

**Impact**: 5 implementations → 1. Any future toggle behavior change (animation, color, accessibility) requires editing exactly one file.

---

## 3. SectionHeader Component Unification

### Before
Section headers were implemented 5 times in SettingsPanel:
1. "AI Provider" — `<div className="text-xs font-medium text-text-muted uppercase tracking-wider mt-4 mb-2">`
2. "Model Configuration" — `<div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">`
3. "Workspace" — `<div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">`
4. "Appearance" — `<div className="text-xs font-medium text-text-muted mt-4 mb-2">`
5. "Advanced" — `<div className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">`

Each had different font sizes (10px, 11px, 12px), different font weights (medium, semibold), different tracking (wider, wide, none), different spacing (mb-2, mb-3), and different text colors (text-muted, text-secondary).

### After
Single `SectionHeader` component in `src/renderer/components/ui/SectionHeader.tsx`:
- Consistent typography: `text-xs font-medium uppercase tracking-wider`
- Consistent color: `text-text-muted`
- Consistent spacing: `mt-4 mb-2` with optional `className` override
- All 5 instances replaced with `<SectionHeader>AI Provider</SectionHeader>`

**Impact**: 5 inconsistent header styles → 1 consistent style. No more subtle visual differences between sections.

---

## 4. Skeleton Component Improvements

### Before
Skeleton components used `animate-shimmer` Tailwind utility class but:
- No explicit `bg-bg-tertiary` background on skeleton elements (relying on animation CSS)
- No `animate-fade-in` entrance on the card wrapper
- Avatar circle had no background color fallback

### After
- SkeletonCard: Added `bg-bg-tertiary` to all shimmer elements and avatar circle, added `animate-fade-in` to wrapper
- SkeletonLine: Added `bg-bg-tertiary` to the shimmer element
- Both now use design tokens exclusively — no raw colors

**Impact**: Shimmer elements are now resilient to CSS loading order issues. The fade-in entrance makes loading states feel smoother.

---

## 5. Execution UX Copy

### Before
- Risk labels: "Low Risk", "Medium Risk", "High Risk" — anxiety-inducing
- Action buttons: "Approve & Execute" — feels final and scary
- Rollback: "Rollback Changes" + "Confirm Rollback" — technical jargon
- Retry: "Retry Failed Step" — emphasizes failure
- Proposal badge: "rollbackable" — not a real word
- Diff summary: "3 file steps with diff preview available. Click each file to expand its diff." — verbose and technical

### After
- Risk labels: "Straightforward — unlikely to cause issues", "Review recommended — you can always undo changes", "Take a moment to review — these are significant changes" — human, reassuring
- Action buttons: "Approve and Run" — clear but not scary
- Undo: "Undo Changes" + "Yes, Undo" — plain language
- Retry: "Try Again" — simple, encouraging
- Proposal badge: "reversible" — real word, clear meaning
- Diff summary: "3 files with changes. Click to preview." — concise, actionable

**Impact**: Every interaction with proposals now builds trust instead of anxiety. The language is consistent with the brand voice (calm, intelligent, trustworthy).

---

## 6. AI Panel Experience

### Before
- Thinking indicator: Generic SkeletonCard placeholder — heavy DOM, no contextual meaning
- Streaming indicator: Plain "Streaming..." text — uninformative
- Empty state: "No messages yet" — dead end
- Message types: No visual distinction between plain text and proposal-bearing messages

### After
- Thinking indicator: Three-dot bounce animation ("Thinking...") — lightweight, contextual, smooth
- Streaming indicator: Pulsing dot + "Writing" label — informative, lightweight
- Empty state: Four task-oriented suggestions with icons — actionable, inviting
- Message types: "Proposed N change(s)" label with + icon above proposal messages — informative without being intrusive

**Impact**: The AI conversation now feels alive and responsive during every state: waiting, thinking, writing, and responding.

---

## 7. Performance Hints

### Before
- No `will-change` declarations — browser had to discover animation properties on each frame
- No CSS containment on scrollable areas — layout recalculation could cascade through the DOM
- No `contain: layout` — scroll events could trigger full-page relayouts

### After
- `will-change: width, opacity` on `.sidebar-panel` and `.ai-panel` — smooth panel transitions
- `will-change: transform, opacity` on `.ai-message` — smooth message entrance
- `will-change: transform` on `.proposal-card` — smooth card animations
- `will-change: transform, opacity` on `.command-palette` — instant overlay response
- `will-change: transform, opacity` on `.thinking-dots span` — smooth bounce
- `will-change: transform` on `.spinner` — smooth rotation
- `contain: layout` on `.ai-messages`, `.terminal-container`, `.scrollbar-custom` — isolated scroll layouts

**Impact**: Panel transitions are smoother, message animations are more consistent, and scroll performance is isolated from layout recalculation.

---

## 8. Onboarding Trust Language

### Before
- Welcome: "Welcome to VibeCode" — generic
- Provider: "Configure your AI provider" — technical
- Ready: "You're all set!" — premature confidence
- Suggestions: "Try the AI chat", "Explore the file tree", "Open a terminal", "Customize settings", "View documentation" — feature-focused

### After
- Welcome: "Welcome to VibeCode — your calm, intelligent engineering partner" — identity + reassurance
- Provider: "Your API key is stored securely on your device" — trust + privacy
- Ready: "You can always undo changes" — permission to experiment
- Suggestions: "Ask the AI to modify your code", "Explore your project files", "Try the built-in terminal", "Open settings to customize" — outcome-focused
- Footer: "Your data stays on your device" — explicit privacy commitment

**Impact**: Onboarding now builds confidence progressively, addresses privacy concerns explicitly, and orients users toward actions rather than features.

---

## Summary Statistics

| Metric | Before ARC 7 | After ARC 7 |
|--------|-------------|-------------|
| Raw color values in components | ~50 | 0 (all via tokens) |
| Font size values below 10px | 5 instances | 0 |
| Duplicate Toggle implementations | 5 | 1 |
| Duplicate SectionHeader implementations | 5 | 1 |
| Inconsistent border colors | 4 variants | 1 (`var(--border)`) |
| CSS `will-change` hints | 0 | 6 element groups |
| CSS containment rules | 0 | 3 containers |
| Trust-breaking copy instances | 8 | 0 |
| Uninformative loading states | 3 | 0 |
