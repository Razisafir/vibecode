# VibeCode Desktop — UI Token Architecture

> **ARC 7 Phase 1 — Design System Unification**
> Architectural decisions and rationale behind the token system.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Architecture Overview](#architecture-overview)
3. [Decision Records](#decision-records)
4. [File Structure & Responsibilities](#file-structure--responsibilities)
5. [Synchronization Strategy](#synchronization-strategy)
6. [Animation Architecture](#animation-architecture)
7. [Token Naming Conventions](#token-naming-conventions)
8. [Future Considerations](#future-considerations)

---

## Problem Statement

Before ARC 7 Phase 1, the VibeCode Desktop codebase suffered from several design system issues:

### 1. Scattered Hardcoded Values
Tailwind classes throughout components used raw hex values (`bg-[#1a1a24]`) and arbitrary values instead of design tokens. This made global visual changes impossible without find-and-replace across dozens of files.

### 2. Duplicate Tailwind Configurations
Two `tailwind.config.js` files existed:
- Root: `/tailwind.config.js`
- Renderer: `/src/renderer/tailwind.config.js`

Both contained overlapping but not identical configurations, creating confusion about which was authoritative and leading to divergent token values.

### 3. Keyframe Animation Duplication
Keyframe animations were duplicated across 4 files:
- `tailwind.config.js` — generic keyframes
- `animations.css` — same generic keyframes + component-specific
- `components.css` — same keyframes again (slideInUp, fadeIn, spin, blink, etc.)
- `index.css` — slideUp keyframe

A change to any animation required updating 2-4 places.

### 4. Incomplete Token Coverage
Missing tokens for:
- Typography scale (font sizes, line heights)
- Spacing scale
- Shadow depth levels
- Semantic color variants (muted/subtle)
- Motion tokens (duration, easing)
- Text hierarchy beyond primary/secondary/muted

### 5. Flat Color Namespace
Colors were defined as flat strings (`'bg-primary': '#0a0a0f'`) instead of nested objects, preventing Tailwind's natural modifier syntax (`bg-bg-primary` vs the more intuitive pattern).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    COMPONENTS (.tsx)                      │
│    Use Tailwind utilities: bg-bg-primary, text-accent     │
│    Use CSS classes: .btn-primary, .spinner, .toast-enter   │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│ TW Config   │ │  CSS Vars    │ │  CSS Files   │
│ (tokens)    │ │  (:root)     │ │  (classes)   │
├─────────────┤ ├──────────────┤ ├──────────────┤
│ Colors      │ │ --bg-*       │ │ components   │
│ Typography  │ │ --border-*   │ │ .css         │
│ Spacing     │ │ --text-*     │ │              │
│ Radius      │ │ --accent-*   │ ├──────────────┤
│ Shadows     │ │ --success-*  │ │ animations   │
│ Animations  │ │ --warning-*  │ │ .css         │
│ Motion      │ │ --error-*    │ │              │
│             │ │ --info-*     │ │ component-   │
│             │ │ --space-*    │ │ specific     │
│             │ │ --duration-* │ │ keyframes    │
│             │ │ --easing-*   │ │              │
│             │ │ --shadow-*   │ │ utility      │
│             │ │ --focus-ring │ │ classes      │
└─────────────┘ └──────────────┘ └──────────────┘
       ▲               ▲                ▲
       │               │                │
       └───────────────┼────────────────┘
                       │
              VALUES MUST MATCH
          (Single source of truth per token)
```

### The Two-Source Model

We deliberately maintain **two synchronized sources** for design tokens:

1. **`tailwind.config.js`** — Provides Tailwind utility classes
2. **`index.css` `:root`** — Provides CSS custom properties

This is not redundancy — it's a **dual-interface design**:

| Interface | Best For | Access Pattern |
|-----------|----------|----------------|
| Tailwind utilities | JSX/TSX components | `className="bg-bg-primary"` |
| CSS custom properties | CSS files, dynamic styles | `background: var(--bg-primary)` |

Both are needed because:
- CSS files (`components.css`, `animations.css`) cannot use Tailwind utilities
- Some components need dynamic style computation (e.g., `style={{ color: 'var(--accent)' }}`)
- CSS custom properties enable runtime theming (future)

---

## Decision Records

### ADR-001: Nested Color Objects in Tailwind Config

**Decision:** Use nested objects for colors (`bg: { primary: '#0a0a0f' }`) instead of flat strings (`'bg-primary': '#0a0a0f'`).

**Rationale:**
- Nested objects enable Tailwind's natural modifier syntax: `bg-bg-primary`, `text-text-muted`
- Groups related tokens visually in the config
- Allows semantic variants: `accent: { DEFAULT, hover, muted, subtle, strong }`
- Consistent with Tailwind's own color structure (`red-500`, `blue-200`)

**Consequences:**
- Class names become `bg-bg-primary` (double "bg") — slightly verbose but unambiguous
- The flat string approach would give `bg-bg-primary` too, so no difference in class names

### ADR-002: Dual-Source Token Synchronization

**Decision:** Maintain both `tailwind.config.js` and CSS custom properties with identical values.

**Rationale:**
- Tailwind config is the only way to generate utility classes
- CSS custom properties are the only way to reference tokens in CSS files
- CSS custom properties enable runtime theming (future dark/light mode, custom themes)
- No build-time tool can bridge both without adding complexity

**Consequences:**
- Token changes require updating two files
- Mitigated by: keeping the same value names and documenting the sync requirement
- Future: Could add a build script that generates CSS variables from Tailwind config

### ADR-003: Single Root Tailwind Config

**Decision:** Delete `src/renderer/tailwind.config.js` and use only the root config.

**Rationale:**
- Two configs created confusion about which was authoritative
- PostCSS (used by Vite) resolves config from the project root
- The renderer-local config had diverged from the root config
- Content paths in the root config already cover `src/renderer/**/*`

**Consequences:**
- All Tailwind configuration in one place
- No ambiguity about which config applies
- `src/renderer/` is scanned by the root config's content path

### ADR-004: Animation Source Hierarchy

**Decision:** Generic animations in `tailwind.config.js`, component-specific in `animations.css`, no duplicates.

**Rationale:**
- Generic animations (fadeIn, slideUp) should be available as both Tailwind utilities and CSS classes
- Tailwind config generates the keyframes in the CSS output automatically
- Component-specific animations (toastSlideIn, thinkingBounce) only need CSS classes
- Duplicates caused divergence (different durations, different easing)

**Consequences:**
- `components.css` and `index.css` no longer define any keyframes
- All keyframe definitions are in exactly one place
- `animations.css` provides CSS class wrappers that reference Tailwind-defined keyframes

### ADR-005: Text Muted vs Tertiary

**Decision:** `text-muted` is now `#6b6b82` (previously `#606078`). New `text-tertiary` token at `#555570`.

**Rationale:**
- The old `text-muted` value `#606078` was used for both "muted but readable" and "tertiary/disabled" text
- WCAG AA contrast requirements differ for these use cases
- `#6b6b82` provides better contrast for placeholder/hint text (muted)
- `#555570` is appropriate for truly de-emphasized text (tertiary)

**Consequences:**
- Existing `text-muted` references now render slightly lighter
- New `text-tertiary` available for deeply de-emphasized content
- `text-inverse` added for text on light/accent backgrounds

### ADR-006: Semantic Color Variants

**Decision:** Each semantic color (success, warning, error, info) has three variants: DEFAULT, muted (15%), subtle (8%).

**Rationale:**
- Status indicators need different visual weights:
  - DEFAULT: Icons, active indicators, error text
  - Muted (15%): Background fills for status badges, alerts
  - Subtle (8%): Hover states, subtle backgrounds
- Consistent opacity ratios (15%/8%) across all semantic colors
- Previously only solid colors existed, leading to ad-hoc opacity values

### ADR-007: SlideUp as the Standard Entry Animation

**Decision:** Replace `slideInUp`, `slideInLeft`, `slideInRight` with a unified `slideUp` animation.

**Rationale:**
- Multiple slide variants with different distances (8px, 20px, 100%, 280px, 400px) created inconsistent motion
- `slideUp` with 8px offset + opacity provides subtle, professional entry
- For directional slides, CSS `transform` can be applied separately
- The 8px translateY is imperceptible for directional intent but provides visual feedback

**Consequences:**
- `.ai-message`, `.proposal-card`, `.command-palette`, `.onboarding-card` all use `slideUp`
- Consistent motion language across the application
- Duration standardized at 250ms with `cubic-bezier(0.4, 0, 0.2, 1)`

---

## File Structure & Responsibilities

```
vibecode-desktop/
├── tailwind.config.js          # Primary token source (colors, typography, spacing, motion, animations)
├── DESIGN_SYSTEM.md            # Token reference documentation
├── UI_TOKEN_ARCHITECTURE.md    # This file — architecture decisions
│
└── src/renderer/styles/
    ├── index.css               # CSS custom properties (:root), base styles, component base classes
    ├── animations.css          # Component-specific keyframes + animation utility classes
    └── components.css          # Component-specific styles (NO keyframe definitions)
```

### What Goes Where

| Content | `tailwind.config.js` | `index.css` | `animations.css` | `components.css` |
|---------|---------------------|-------------|-------------------|-------------------|
| Color tokens | ✅ | ✅ (CSS vars) | — | — |
| Typography tokens | ✅ | — | — | — |
| Spacing tokens | ✅ | ✅ (CSS vars) | — | — |
| Shadow tokens | ✅ | ✅ (CSS vars) | — | — |
| Motion tokens | ✅ | ✅ (CSS vars) | — | — |
| Generic keyframes | ✅ | — | — | — |
| Component keyframes | — | — | ✅ | — |
| Animation utility classes | — | — | ✅ | — |
| Component styles | — | ✅ (base) | — | ✅ (specific) |
| Base HTML styles | — | ✅ | — | — |
| Scrollbar styles | — | ✅ | — | — |

---

## Synchronization Strategy

### Current (Manual)

Token changes must be made in both `tailwind.config.js` and `index.css` `:root` with identical values.

**Checklist for adding a new token:**

1. Add to `tailwind.config.js` under `theme.extend.{category}`
2. Add matching CSS variable to `index.css` `:root`
3. Verify values are identical
4. Update `DESIGN_SYSTEM.md`

### Future (Automated)

A build-time script could generate CSS variables from the Tailwind config:

```javascript
// scripts/generate-css-vars.js (future)
import tailwindConfig from '../tailwind.config.js';

// Walk tailwindConfig.theme.extend and emit CSS custom properties
// Output to src/renderer/styles/generated-tokens.css
```

This would make `tailwind.config.js` the single source of truth with CSS variables derived automatically.

---

## Animation Architecture

### Three-Tier Animation System

```
Tier 1: Tailwind Utility Classes (JSX)
  animate-fade-in, animate-slide-up, animate-shimmer
  ↓ Generated by Tailwind from config keyframes

Tier 2: CSS Utility Classes (animations.css)
  .animate-fade-in, .animate-slide-up, .animate-shimmer
  ↓ Reference same keyframe names as Tailwind

Tier 3: Component-Specific (animations.css)
  .toast-enter, .toast-exit
  .message-fade-in
  ↓ Reference component-specific keyframes
```

### Why Two Sets of Utility Classes?

Tailwind generates `animate-*` utilities that use `animation-name` from its keyframes config. However:

1. **CSS files can't use Tailwind utilities** — they need raw CSS class definitions
2. **Some animations need CSS enhancements** — `.animate-shimmer` includes a `background` definition
3. **Tailwind utilities may not be available** in all contexts (e.g., dynamically loaded stylesheets)

The CSS utility classes in `animations.css` are thin wrappers that reference the same keyframe names that Tailwind generates, ensuring consistency.

---

## Token Naming Conventions

### Pattern

```
{category}-{property}-{variant}
```

### Categories

| Category | Prefix | Examples |
|----------|--------|----------|
| Background | `bg-` | `bg-primary`, `bg-hover`, `bg-active` |
| Border | `border-` | `border-subtle`, `border-emphasis` |
| Text | `text-` | `text-primary`, `text-muted`, `text-tertiary` |
| Accent | `accent-` | `accent-hover`, `accent-muted`, `accent-subtle` |
| Semantic | `{name}-` | `success-muted`, `error-subtle` |
| Spacing | `space-` | `space-1`, `space-4` |
| Duration | `duration-` | `duration-fast`, `duration-slow` |
| Easing | `easing-` | `easing-default`, `easing-spring` |
| Shadow | `shadow-` | `shadow-sm`, `shadow-lg` |

### Variant Suffixes

| Suffix | Meaning | Opacity |
|--------|---------|---------|
| (none) | Default/solid | 100% |
| `hover` | Hover state | — |
| `active` | Active/pressed state | — |
| `muted` | Low-contrast fill | ~15% |
| `subtle` | Very low-contrast fill | ~8% |
| `strong` | Emphasized variant | — |
| `emphasis` | Emphasized variant | — |
| `focus` | Focus state | — |
| `inverse` | Inverted for contrast | — |
| `elevated` | Floating/overlay | — |

---

## Future Considerations

### Light Mode Support

The current token system is dark-mode only. Adding light mode would require:

1. Duplicate all color tokens with light-mode values
2. Use CSS `:root` vs `.light` selector (or `prefers-color-scheme`)
3. Tailwind's `darkMode: 'class'` already configured

### Theme Customization

CSS custom properties enable runtime theme customization:

```javascript
// Future: User could override tokens
document.documentElement.style.setProperty('--accent', '#10b981'); // emerald accent
```

### Component Library Extraction

The token system is designed to be extractable into a standalone package:

```
@vibecode/design-tokens
  ├── colors.json
  ├── typography.json
  ├── spacing.json
  ├── motion.json
  └── index.js (generates Tailwind preset + CSS variables)
```

### Design Token Pipeline

A future build pipeline could:

1. Define tokens in a single JSON/YAML source
2. Generate `tailwind.config.js` tokens
3. Generate CSS custom properties
4. Generate documentation
5. Validate WCAG contrast ratios
