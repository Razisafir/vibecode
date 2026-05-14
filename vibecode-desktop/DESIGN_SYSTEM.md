# VibeCode Desktop — Design System

> **ARC 7 Phase 1 — Design System Unification**
> Single source of truth for all visual decisions.

---

## Table of Contents

1. [Design Tokens Overview](#design-tokens-overview)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing](#spacing)
5. [Border Radius](#border-radius)
6. [Shadows](#shadows)
7. [Animation System](#animation-system)
8. [Motion & Transitions](#motion--transitions)
9. [Usage Guidelines](#usage-guidelines)
10. [Migration Notes](#migration-notes)

---

## Design Tokens Overview

All visual decisions flow from two synchronized sources:

| Source | Purpose | Location |
|--------|---------|----------|
| `tailwind.config.js` | Tailwind utility classes (`bg-*`, `text-*`, etc.) | Project root |
| `index.css` `:root` | CSS custom properties (`var(--*)`) | `src/renderer/styles/index.css` |

**These two files MUST stay in sync.** Every color, spacing value, and motion token exists in both places with identical values.

### Animation Sources

| Source | Purpose | Location |
|--------|---------|----------|
| `tailwind.config.js` keyframes | Generic animations (fadeIn, slideUp, etc.) | Project root |
| `animations.css` keyframes | Component-specific (toast, thinking dots, blink, etc.) | `src/renderer/styles/animations.css` |

---

## Color System

### Background Layers (Depth System)

The background system uses a depth metaphor — deeper layers are darker, surface layers are lighter.

| Token | Tailwind Class | CSS Variable | Value | Usage |
|-------|---------------|--------------|-------|-------|
| `bg.primary` | `bg-bg-primary` | `--bg-primary` | `#0a0a0f` | Deepest background, main canvas |
| `bg.secondary` | `bg-bg-secondary` | `--bg-secondary` | `#111118` | Sidebar, panels |
| `bg.tertiary` | `bg-bg-tertiary` | `--bg-tertiary` | `#1a1a24` | Cards, elevated surfaces |
| `bg.elevated` | `bg-bg-elevated` | `--bg-elevated` | `#16161f` | Floating elements, overlays |
| `bg.hover` | `bg-bg-hover` | `--bg-hover` | `#222233` | Hover state fill |
| `bg.active` | `bg-bg-active` | `--bg-active` | `#2a2a3d` | Active/pressed state fill |

**Depth ordering:** primary < secondary < elevated < tertiary < hover < active

### Border System

| Token | Tailwind Class | CSS Variable | Value | Usage |
|-------|---------------|--------------|-------|-------|
| `border.DEFAULT` | `border-border` | `--border` | `#32324a` | Standard borders |
| `border.subtle` | `border-border-subtle` | `--border-subtle` | `#262638` | Divider lines, subtle separators |
| `border.emphasis` | `border-border-emphasis` | `--border-emphasis` | `#404060` | Emphasized borders, active state |
| `border.focus` | `border-border-focus` | `--border-focus` | `#6366f1` | Focus ring borders |

### Text Hierarchy

| Token | Tailwind Class | CSS Variable | Value | Usage |
|-------|---------------|--------------|-------|-------|
| `text.primary` | `text-text-primary` | `--text-primary` | `#eeeef4` | Headlines, primary content |
| `text.secondary` | `text-text-secondary` | `--text-secondary` | `#9898b0` | Body text, descriptions |
| `text.muted` | `text-text-muted` | `--text-muted` | `#6b6b82` | Placeholder, hint text |
| `text.tertiary` | `text-text-tertiary` | `--text-tertiary` | `#555570` | Disabled, deep background text |
| `text.inverse` | `text-text-inverse` | `--text-inverse` | `#0a0a0f` | Text on light/accent backgrounds |

### Accent (Primary Action Color)

| Token | Tailwind Class | CSS Variable | Value | Usage |
|-------|---------------|--------------|-------|-------|
| `accent.DEFAULT` | `bg-accent` / `text-accent` | `--accent` | `#6366f1` | Primary buttons, links, active |
| `accent.hover` | `bg-accent-hover` | `--accent-hover` | `#818cf8` | Button hover state |
| `accent.strong` | `bg-accent-strong` | `--accent-strong` | `#4f46e5` | Emphasized accent |
| `accent.muted` | `bg-accent-muted` | `--accent-muted` | `rgba(99, 102, 241, 0.15)` | Accent backgrounds, badges |
| `accent.subtle` | `bg-accent-subtle` | `--accent-subtle` | `rgba(99, 102, 241, 0.08)` | Subtle accent backgrounds |

### Semantic Colors

Each semantic color has three variants: **DEFAULT** (solid), **muted** (15% opacity), and **subtle** (8% opacity).

| Category | DEFAULT | Muted (15%) | Subtle (8%) |
|----------|---------|-------------|-------------|
| **Success** | `#22c55e` | `rgba(34, 197, 94, 0.15)` | `rgba(34, 197, 94, 0.08)` |
| **Warning** | `#eab308` | `rgba(234, 179, 8, 0.15)` | `rgba(234, 179, 8, 0.08)` |
| **Error** | `#ef4444` | `rgba(239, 68, 68, 0.15)` | `rgba(239, 68, 68, 0.08)` |
| **Info** | `#3b82f6` | `rgba(59, 130, 246, 0.15)` | `rgba(59, 130, 246, 0.08)` |

**Tailwind classes:** `bg-success`, `bg-success-muted`, `bg-error-subtle`, etc.
**CSS variables:** `--success`, `--success-muted`, `--success-subtle`, etc.

---

## Typography

### Font Families

| Token | Value | Usage |
|-------|-------|-------|
| `font-sans` | `Inter, system-ui, -apple-system, sans-serif` | UI text |
| `font-mono` | `JetBrains Mono, Fira Code, Consolas, monospace` | Code, terminal |

### Type Scale

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-2xs` | 10px | 14px | Micro labels, timestamps |
| `text-xs` | 12px | 16px | Small labels, badges |
| `text-sm` | 13px | 20px | Body text (primary) |
| `text-base` | 14px | 22px | Default body |
| `text-lg` | 16px | 24px | Section headings |
| `text-xl` | 18px | 28px | Panel titles |
| `text-2xl` | 20px | 30px | Page titles |

---

## Spacing

The spacing scale follows a 4px base unit system:

| Token | Value | Common Usage |
|-------|-------|--------------|
| `0.5` | 2px | Micro gaps |
| `1` | 4px | Inline spacing |
| `1.5` | 6px | Button gaps, icon margins |
| `2` | 8px | Compact padding |
| `2.5` | 10px | — |
| `3` | 12px | Standard padding |
| `3.5` | 14px | — |
| `4` | 16px | Card padding, section gaps |
| `5` | 20px | Panel padding |
| `6` | 24px | Large section gaps |
| `7` | 28px | — |
| `8` | 32px | Page margins |
| `10` | 40px | Large spacers |
| `12` | 48px | — |
| `16` | 64px | — |
| `20` | 80px | — |

CSS variable equivalents: `var(--space-0)`, `var(--space-1)`, `var(--space-2)`, etc.

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 4px | Small elements, tags |
| `rounded` (DEFAULT) | 6px | Buttons, inputs |
| `rounded-md` | 8px | Cards, panels |
| `rounded-lg` | 12px | AI message bubbles |
| `rounded-xl` | 16px | Onboarding cards |
| `rounded-2xl` | 20px | Large modals |
| `rounded-full` | 9999px | Circles, pills |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle elevation |
| `shadow-sm` | `0 2px 4px rgba(0,0,0,0.3)` | Small dropdowns |
| `shadow` (DEFAULT) | `0 4px 8px rgba(0,0,0,0.3)` | Standard elevation |
| `shadow-md` | `0 6px 12px rgba(0,0,0,0.35)` | Panels |
| `shadow-lg` | `0 10px 20px rgba(0,0,0,0.4)` | Modals |
| `shadow-xl` | `0 25px 50px rgba(0,0,0,0.5)` | Command palette |
| `shadow-focus-ring` | `0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent)` | Focus indicator |
| `shadow-focus-ring-error` | `0 0 0 2px var(--bg-primary), 0 0 0 4px var(--error)` | Error focus ring |

CSS variable equivalents: `var(--shadow-xs)`, `var(--shadow-sm)`, etc.

---

## Animation System

### Generic Animations (Tailwind Config)

These are defined in `tailwind.config.js` keyframes and available as both Tailwind utilities and CSS classes:

| Animation | Tailwind Class | CSS Class | Duration | Easing |
|-----------|---------------|-----------|----------|--------|
| Fade In | `animate-fade-in` | `.animate-fade-in` | 200ms | ease-out |
| Fade Out | `animate-fade-out` | `.animate-fade-out` | 200ms | ease-in |
| Slide Up | `animate-slide-up` | `.animate-slide-up` | 250ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Slide Down | `animate-slide-down` | `.animate-slide-down` | 250ms | cubic-bezier(0.4, 0, 0.2, 1) |
| Scale In | `animate-scale-in` | `.animate-scale-in` | 200ms | ease-out |
| Pulse Subtle | `animate-pulse-subtle` | `.animate-pulse-subtle` | 2s | ease-in-out |
| Shimmer | `animate-shimmer` | `.animate-shimmer` | 1.5s | ease-in-out |
| Pulse Slow | `animate-pulse-slow` | — | 3s | cubic-bezier(0.4, 0, 0.6, 1) |
| Spin | `animate-spin` | — | 600ms | linear |

### Component-Specific Animations (animations.css)

These are defined only in `animations.css` because they serve specific components:

| Animation | Usage | Duration |
|-----------|-------|----------|
| `blink` | Streaming text cursor | 1s |
| `thinkingBounce` | AI thinking dots | 1.4s |
| `pendingPulse` | Pending proposal cards | 2s |
| `pulseActive` | Active execution indicator | 2s |
| `spin` | Loading spinners | 600ms |
| `toastSlideIn` | Toast notification enter | 300ms |
| `toastSlideOut` | Toast notification exit | 200ms |

### Transition Classes (animations.css)

| Class | Properties | Duration | Easing |
|-------|-----------|----------|--------|
| `.panel-transition` | width, opacity, transform | 200ms | ease-out |
| `.sidebar-transition` | width, opacity | 250ms / 200ms | cubic-bezier(0.4, 0, 0.2, 1) |
| `.ai-panel-transition` | width, opacity | 250ms / 200ms | cubic-bezier(0.4, 0, 0.2, 1) |
| `.resize-handle-transition` | background-color | 150ms | ease |
| `.message-fade-in` | fadeIn + slideUp | 200ms / 250ms | ease-out / cubic-bezier |
| `.toast-enter` | toastSlideIn | 300ms | cubic-bezier(0.21, 1.02, 0.73, 1) |
| `.toast-exit` | toastSlideOut | 200ms | ease-in |

---

## Motion & Transitions

### Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | 75ms | Micro-interactions |
| `--duration-normal` | 150ms | Standard transitions |
| `--duration-slow` | 250ms | Panel transitions |
| `--duration-slower` | 350ms | Complex animations |

Tailwind: `duration-75`, `duration-100`, `duration-150`, `duration-200`, `duration-250`, `duration-300`

### Easing Functions

| Token | Value | Usage |
|-------|-------|-------|
| `--easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard motion |
| `--easing-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful, bouncy |
| `--easing-smooth` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Smooth, cinematic |

Tailwind: `ease-default`, `ease-spring`, `ease-smooth`

---

## Usage Guidelines

### When to Use Tailwind vs CSS Variables

| Scenario | Use | Example |
|----------|-----|---------|
| JSX/TSX styling | Tailwind utilities | `className="bg-bg-secondary text-text-primary"` |
| CSS files | CSS custom properties | `background-color: var(--bg-secondary)` |
| Dynamic/themed values | CSS custom properties | `style={{ color: 'var(--accent)' }}` |
| Hover/active states | CSS custom properties | `.btn:hover { background: var(--bg-hover) }` |

### Naming Conventions

- **Tailwind colors** use nested objects: `bg.primary` → `bg-bg-primary`
- **CSS variables** use dashes: `--bg-primary`
- **Semantic tokens** use category suffixes: `--success-muted`, `--accent-subtle`

### Adding New Tokens

1. Add to `tailwind.config.js` under `theme.extend`
2. Add matching CSS variable to `index.css` `:root`
3. Ensure values are **identical** in both places
4. Update this document

---

## Migration Notes

### Changes from Pre-ARC 7

| What Changed | Old | New |
|--------------|-----|-----|
| Text muted | `#606078` | `#6b6b82` (better contrast) |
| Color structure | Flat (`'bg-primary': '...'`) | Nested (`bg: { primary: '...' }`) |
| `text-muted` token | Also meant "tertiary" | Now `#6b6b82`; new `text-tertiary` = `#555570` |
| New bg tokens | — | `bg-active`, `bg-elevated` |
| New border tokens | — | `border-focus` |
| New accent tokens | — | `accent-subtle`, `accent-strong` |
| New semantic tokens | Flat colors only | `*-muted`, `*-subtle` variants |
| Animation sources | Duplicated in 4 files | Single source: Tailwind config + animations.css |
| Duplicate tailwind config | `src/renderer/tailwind.config.js` | **Deleted** — root config only |
| Typography scale | Not defined | Full 7-step scale with line heights |
| Spacing scale | Not defined | Explicit 4px base grid |
| Shadow system | Only `focus-ring` | 6 depth levels + focus rings |
| Motion tokens | Only `--transition-speed` | Full duration + easing scale |

### Keyframe Deduplication

The following keyframes were removed from `components.css` and `index.css` because they now live in either `tailwind.config.js` or `animations.css`:

- `fadeIn`, `fadeOut` → Tailwind config
- `slideUp`, `slideDown` → Tailwind config
- `slideInUp`, `slideInLeft`, `slideInRight` → Replaced by `slideUp`
- `scaleIn` → Tailwind config
- `pulseSubtle` → Tailwind config
- `shimmer` → Tailwind config
- `blink`, `thinkingBounce`, `pendingPulse`, `pulseActive`, `spin` → animations.css
