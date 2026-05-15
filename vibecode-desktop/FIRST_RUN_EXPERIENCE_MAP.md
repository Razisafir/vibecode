# First Run Experience Map — VibeCode Desktop

## Overview

This document maps the complete first-run experience for a new VibeCode Desktop user, from app launch to first meaningful interaction. The goal is to ensure every step builds confidence, reduces anxiety, and guides the user toward their first successful outcome.

---

## Step-by-Step Flow

### Step 1: App Launch

**What happens:**
- Electron app starts, Chromium initializes
- Splash screen is not currently implemented (improvement opportunity)
- Main window renders with `animate-fade-in` transition

**What the user sees:**
- Blank dark window briefly, then the full UI fades in
- If first launch: Onboarding overlay covers the entire screen
- If returning user: Main interface with sidebar collapsed, AI panel showing empty state

**Timing:** ~2-3 seconds cold start (Electron overhead), ~0.5s for React hydration

**Trust signals:** None currently. A branded loading screen would help.

**Anxiety risks:** The blank window before React renders feels like a crash. The dark empty state is intimidating for new users who don't know what to do.

---

### Step 2: Onboarding — Welcome (Step 1 of 3)

**What happens:**
- Full-screen overlay with centered card (520px wide, max 90vh)
- `fadeIn` 300ms animation on overlay, `slideUp` 250ms on card
- Three progress dots at top (first dot is active/pill-shaped)

**What the user sees:**
- VibeCode logo/illustration area (200px height)
- Heading: "Welcome to VibeCode"
- Subheading: "Your calm, intelligent engineering partner"
- "Get Started" primary button
- "Skip" text link in footer
- Privacy message: "Your data stays on your device"

**What the user feels:**
- Calm — the dark interface with subtle animation feels professional
- Curious — the "intelligent engineering partner" language sets expectations
- Safe — the privacy message addresses a common concern early

**Timing:** User-controlled. Average 3-5 seconds on this step.

**Trust signals:** Privacy message, calm language, professional design.

**Anxiety risks:** The 200px illustration area is currently empty/decorative. Without a visual anchor, some users may feel uncertain about what the product does.

---

### Step 3: Onboarding — Provider Configuration (Step 2 of 3)

**What happens:**
- Card content transitions (step change animation)
- Second progress dot becomes active, first shows completed state
- Form fields appear for AI provider configuration

**What the user sees:**
- Heading: "Connect Your AI Provider"
- Provider selector (dropdown or radio buttons)
- API key input field with visibility toggle
- Model selection dropdown
- Subheading: "Your API key is stored securely on your device"
- "Continue" primary button
- "Back" text link

**What the user feels:**
- In control — they choose their provider, not locked in
- Secure — the visibility toggle and security message address key storage concerns
- Prepared — they understand what they need (an API key) before proceeding

**Timing:** 30-60 seconds for users who have an API key ready. Several minutes for users who need to create one.

**Trust signals:** API key visibility toggle, security message, familiar provider names.

**Anxiety risks:** Users who don't have an API key may feel stuck. The onboarding doesn't currently offer a "skip and configure later" path at this step (only on the welcome step). The API key input feels like a password field, which is correct for security but may feel intimidating.

---

### Step 4: Onboarding — Ready (Step 3 of 3)

**What happens:**
- Third progress dot becomes active, all dots show completion
- Card content transitions to the ready state

**What the user sees:**
- Heading: "You're Ready to Build"
- Subheading: "You can always undo changes"
- Four confidence-focused suggestion items:
  1. "Ask the AI to modify your code"
  2. "Explore your project files"
  3. "Try the built-in terminal"
  4. "Open settings to customize"
- "Start Coding" primary button

**What the user feels:**
- Empowered — "you can always undo" gives permission to experiment
- Oriented — the four suggestions provide clear next actions
- Ready — the "Start Coding" button is a clear call to action

**Timing:** 5-10 seconds typically, as users scan the suggestions.

**Trust signals:** "You can always undo changes" directly addresses the #1 fear of AI coding tools.

**Anxiety risks:** The jump from onboarding to the main interface is abrupt. The suggestions are text-only without icons or interactive elements — they're hints, not buttons. Users may not remember them once the overlay closes.

---

### Step 5: Main Interface — First Impression

**What happens:**
- Onboarding overlay dismisses with fade-out
- Main interface is revealed for the first time
- Sidebar is collapsed by default
- AI panel shows empty state with suggestions
- Terminal is in idle state
- Editor area shows welcome/empty state

**What the user sees:**
- Titlebar with traffic lights and "VIBECODE" label
- Activity bar (60px) with icon buttons: Files, Search, Settings
- Collapsed sidebar panel (0 width)
- Main editor area (flex: 1)
- AI panel (right side) with empty state:
  - "How can I help?" heading
  - Four task-oriented suggestions:
    1. "Help me understand this project"
    2. "Add a new feature"
    3. "Find and fix issues"
    4. "Write tests for my code"
  - Text input with placeholder "Ask anything about your code..."
  - Send button

**What the user feels:**
- Focused — the empty state suggestions guide them toward the first action
- Capable — the AI panel is prominent and inviting
- Curious — they want to try asking a question

**Timing:** 2-5 seconds before the user takes their first action.

**Trust signals:** Empty state suggestions are concrete and action-oriented. The input placeholder is friendly ("Ask anything").

**Anxiety risks:** The sidebar is collapsed, so the user may not realize they can explore files. The editor area is empty — they don't have a project open yet. The terminal is hidden behind a tab.

---

### Step 6: First AI Interaction

**What happens:**
- User types a message in the AI input
- User presses Enter or clicks Send
- Input clears, user message appears in chat with `slideUp` animation
- Thinking dots animation plays for 1-4 seconds
- AI response streams in with cursor blink animation

**What the user sees:**
- Their message in an accent-colored bubble (right-aligned)
- Three bouncing dots labeled "Thinking..."
- Streaming text with cursor: "I'll help you with that..."
- If the AI proposes changes: a proposal card appears with risk level, step count, and "Approve and Run" button

**What the user feels:**
- Engaged — the thinking dots create anticipation without anxiety
- Informed — the streaming text shows progress in real-time
- Empowered — the proposal card gives them a clear decision point

**Timing:** 3-10 seconds for AI response, 5-30 seconds for a proposal.

**Trust signals:** "Thinking..." is honest about processing time. Streaming shows real-time progress. "Approve and Run" is clear and requires explicit consent.

**Anxiety risks:** First proposal is the highest-anxiety moment. "Approve and Run" requires trust. The "reversible" badge helps, but the user hasn't tested the undo capability yet.

---

### Step 7: First Approval

**What happens:**
- User clicks "Approve and Run"
- Proposal transitions to "executing" state
- Steps execute sequentially with status indicators
- Terminal shows command output
- On completion: success state with "Undo Changes" button

**What the user sees:**
- Proposal card shows executing animation
- Steps change from pending → running → completed
- Terminal output scrolls in real-time
- Success confirmation: "Changes applied successfully"
- "Undo Changes" button prominently displayed

**What the user feels:**
- Relief — the changes worked as expected
- Confident — the undo button is right there if needed
- Accomplished — they successfully used the AI to modify their code

**Timing:** 5-30 seconds depending on the changes.

**Trust signals:** Success confirmation, visible undo button, "reversible" badge, terminal output transparency.

**Anxiety risks:** If an error occurs, the error state feels terminal rather than recoverable. The "Try Again" button helps, but the visual presentation could be more reassuring.

---

## Critical Path Timing

| Step | Duration | Cumulative |
|------|----------|------------|
| App launch | 2-3s | 3s |
| Onboarding welcome | 3-5s | 8s |
| Provider configuration | 30-60s | 68s |
| Onboarding ready | 5-10s | 78s |
| First impression | 2-5s | 83s |
| First AI interaction | 3-10s | 93s |
| First approval | 5-30s | 123s |

**Time to first value: ~2 minutes** (assuming API key is ready)

## Improvement Opportunities

1. **Branded splash screen** during Electron boot (~2s of blank screen currently)
2. **Skip provider setup** option with a "configure later" path
3. **Interactive suggestions** on the ready step (click to auto-populate AI input)
4. **Post-onboarding tooltip tour** that highlights key UI elements
5. **First proposal special treatment** — extra reassurance, step-by-step walkthrough
6. **Auto-open workspace** prompt after onboarding if no project is open
7. **Undo demonstration** — after first approval, briefly highlight the undo button
