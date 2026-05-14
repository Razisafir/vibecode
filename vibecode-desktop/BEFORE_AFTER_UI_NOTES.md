# Before/After UI Notes — ARC 7

Complete table of all changes made during ARC 7, organized by category.

## Design Tokens

| Area | Before | After | Files |
|------|--------|-------|-------|
| Background colors | Raw hex (#0a0a0f, #1a1a2e, #2a2a3d) | CSS variables (--bg-primary, --bg-secondary, --bg-tertiary) | All components |
| Text colors | text-gray-400, text-gray-300, text-white | text-text-muted, text-text-secondary, text-text-primary | All components |
| Border color | border-gray-700, border-gray-800, border-[#2a2a3d] | border-border (var(--border)) | All components |
| Accent color | Hardcoded #6366f1 | var(--accent) with var(--accent-muted) variant | All components |
| Font sizes below 10px | text-[9px], text-[10px] | text-2xs (10px minimum) | ProposalCard |
| Font size 11px | text-[11px] | text-xs (12px) | ProposalCard, SectionHeaders |

## Component Unification

| Component | Before | After | Files Changed |
|-----------|--------|-------|---------------|
| Toggle | 5 inline implementations | 1 shared Toggle component | Onboarding.tsx, SettingsPanel.tsx, ui/Toggle.tsx |
| SectionHeader | 5 inline implementations with varying styles | 1 shared SectionHeader component | SettingsPanel.tsx, ui/SectionHeader.tsx |
| SkeletonCard | No bg fallback, no fade-in | bg-bg-tertiary fallback, animate-fade-in entrance | SkeletonCard.tsx |
| SkeletonLine | No bg fallback | bg-bg-tertiary fallback | SkeletonLine.tsx |
| Spinner | Duplicate in 2 files | Shared via CSS class | components.css |

## Execution UX Copy

| Element | Before | After | Component |
|---------|--------|-------|-----------|
| Proposal badge | "rollbackable" | "reversible" | ProposalCard |
| Approve button | "Approve & Execute" | "Approve and Run" | ProposalCard |
| Rollback button | "Rollback Changes" | "Undo Changes" | ProposalCard |
| Rollback confirm | "Confirm Rollback" | "Yes, Undo" | ProposalCard |
| Rollback prompt | "Are you sure?" | "Undo these changes?" | ProposalCard |
| Retry button | "Retry Failed Step" | "Try Again" | ProposalCard |
| Low risk text | "Low Risk" | "Straightforward — unlikely to cause issues" | ProposalCard |
| Medium risk text | "Medium Risk" | "Review recommended — you can always undo changes" | ProposalCard |
| High risk text | "High Risk" | "Take a moment to review — these are significant changes" | ProposalCard |
| Diff summary | "3 file steps with diff preview available..." | "3 files with changes. Click to preview." | ProposalCard |
| Type label: file_create | "File Create" | "New File" | ProposalCard |
| Type label: file_delete | "File Delete" | "Remove File" | ProposalCard |
| Type label: diff_apply | "Diff Apply" | "Apply Changes" | ProposalCard |
| New section | None | "What Will Happen" summary with undo reassurance | ProposalCard |

## AI Panel Experience

| Element | Before | After | Component |
|---------|--------|-------|-----------|
| Thinking indicator | SkeletonCard placeholder | Three-dot bounce animation ("Thinking...") | AIPanel |
| Streaming indicator | "Streaming..." text | Pulsing dot + "Writing" label | AIPanel |
| Empty state | "No messages yet" | 4 task-oriented suggestions with icons | AIPanel |
| Proposal messages | No type indicator | "Proposed N change(s)" label with + icon | AIPanel |
| Input focus | No visual feedback | Panel focus ring glow on focus-within | AIPanel |

## Microinteractions

| Element | Before | After | Location |
|---------|--------|-------|----------|
| Card hover | No feedback | Gentle translateY(-1px) + shadow lift | components.css, ProposalCard |
| Button press | No active feedback | scale(0.97) on :active | index.css |
| Sidebar icons | Hover only | Hover scale(1.05) + active scale(0.95) | components.css |
| Titlebar buttons | Basic hover | Hover scale(1.05) + active scale(0.95) | components.css |
| Panel focus | No focus indication | Border glow with accent color | components.css |
| Item entrance | Immediate | slideUp animation on render | components.css |

## Onboarding

| Element | Before | After | Location |
|---------|--------|-------|----------|
| Welcome text | "Welcome to VibeCode" | "Welcome to VibeCode — your calm, intelligent engineering partner" | Onboarding.tsx |
| Provider description | "Configure your AI provider" | "Your API key is stored securely on your device" | Onboarding.tsx |
| Ready text | "You're all set!" | "You can always undo changes" | Onboarding.tsx |
| Ready suggestions | 5 feature-focused items | 4 confidence-focused items | Onboarding.tsx |
| Privacy message | None | "Your data stays on your device" | Onboarding.tsx |

## Performance

| Element | Before | After | Location |
|---------|--------|-------|----------|
| will-change on panels | None | will-change: width, opacity | components.css |
| will-change on messages | None | will-change: transform, opacity | components.css |
| will-change on cards | None | will-change: transform | components.css |
| will-change on command palette | None | will-change: transform, opacity | components.css |
| will-change on thinking dots | None | will-change: transform, opacity | components.css |
| will-change on spinner | None | will-change: transform | components.css |
| CSS containment on scroll | None | contain: layout | components.css |
| Touch scrolling | Not optimized | -webkit-overflow-scrolling: touch | components.css |
