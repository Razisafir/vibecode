# Onboarding Flow — VibeCode Desktop

## Flow Architecture

The onboarding flow is a 3-step modal overlay presented to first-time users. It is implemented in `src/renderer/components/Onboarding.tsx` and is controlled by the `hasCompletedOnboarding` flag in the application state.

---

## Design Decisions

### Decision 1: Three Steps, Not Five

**Original plan:** 5-step onboarding (Welcome → Provider → Workspace → Appearance → Ready)

**Final decision:** 3-step onboarding (Welcome → Provider → Ready)

**Rationale:** Five steps felt like a setup wizard, not a friendly introduction. Each additional step increases abandonment risk. Workspace and appearance settings can be configured later in the Settings panel — they don't block the user's first experience. The provider step is the only truly required configuration because the AI features won't work without it.

### Decision 2: Full-Screen Overlay, Not Sidebar

**Original plan:** Onboarding as a sidebar panel that walks through steps while the main UI is partially visible.

**Final decision:** Full-screen overlay with centered card (520px wide).

**Rationale:** A full-screen overlay creates focus. The user isn't distracted by the underlying UI while they're making configuration decisions. The centered card feels like a dialog, which matches the mental model of "setting up" rather than "using." Once onboarding completes, the overlay dismisses and the full UI is revealed — a satisfying "reveal" moment.

### Decision 3: Skip Button on Every Step

**Decision:** Every step has a visible "Skip" option in the footer.

**Rationale:** Forced onboarding creates resentment. Some users want to explore the interface before committing to provider configuration. The skip button respects the user's autonomy and reduces the feeling of being trapped in a wizard. Users who skip will see an appropriate empty state in the AI panel that guides them to configure later.

### Decision 4: Privacy Message in Footer

**Decision:** "Your data stays on your device" appears in the onboarding footer.

**Rationale:** Data privacy is a top concern for developers evaluating AI coding tools. By addressing it proactively in the onboarding — not in a privacy policy link, but as a direct statement in the UI — we build trust before the user has even configured the app. This is especially important during the provider step, where the user is about to enter an API key.

### Decision 5: Confidence-Focused Ready Suggestions

**Original plan:** Feature-focused suggestions: "Try the AI chat", "Explore the file tree", "Open a terminal", "Customize settings", "View documentation"

**Final decision:** Confidence-focused suggestions: "Ask the AI to modify your code", "Explore your project files", "Try the built-in terminal", "Open settings to customize"

**Rationale:** The original suggestions described features — they told the user what the app *has*. The new suggestions describe outcomes — they tell the user what they can *do*. "Try the AI chat" is a feature; "Ask the AI to modify your code" is an action. Outcome-oriented language is more motivating and gives the user a concrete first step.

### Decision 6: "You Can Always Undo" on Ready Step

**Decision:** The ready step's primary message is "You can always undo changes" rather than "You're all set!"

**Rationale:** "You're all set!" is premature confidence — the user hasn't actually *done* anything yet. "You can always undo changes" addresses the primary fear that prevents developers from trying AI coding tools: "What if it breaks my code?" By giving permission to experiment before the user has even started, we remove the biggest barrier to engagement.

### Decision 7: API Key Visibility Toggle

**Decision:** The provider configuration includes a visibility toggle (show/hide) for the API key field.

**Rationale:** API keys are sensitive credentials. Showing them in plain text creates anxiety — what if someone looks over my shoulder? What if I screenshot this? The visibility toggle follows the standard password field pattern, which users already trust. It also reinforces the "secure on your device" message by treating the key with appropriate sensitivity.

---

## Step Details

### Step 1: Welcome

**Purpose:** Establish identity, set expectations, provide first impression

**Content:**
- Heading: "Welcome to VibeCode"
- Subheading: "Your calm, intelligent engineering partner"
- Illustration area: 200px decorative space (improvement opportunity: branded illustration)
- Primary button: "Get Started"
- Footer: "Your data stays on your device" + "Skip" link

**Required user action:** Click "Get Started" or "Skip"

**State after step:** Progress dot 1 filled, dot 2 active

### Step 2: Provider Configuration

**Purpose:** Configure the AI provider so the conversation features work

**Content:**
- Heading: "Connect Your AI Provider"
- Subheading: "Your API key is stored securely on your device"
- Provider selector (OpenAI, Anthropic, etc.)
- API key input with visibility toggle
- Model selection dropdown
- Primary button: "Continue"
- Footer: "Back" link

**Required user action:** Select provider, enter API key, optionally choose model

**State after step:** Progress dot 2 filled, dot 3 active

**Validation:** API key field must not be empty to enable "Continue" button. No network validation at this step (validated on first API call).

### Step 3: Ready

**Purpose:** Give permission to experiment, orient toward first actions

**Content:**
- Heading: "You're Ready to Build"
- Subheading: "You can always undo changes"
- Four suggestion items (icon + text)
- Primary button: "Start Coding"
- Footer: "Back" link

**Required user action:** Click "Start Coding"

**State after step:** Onboarding overlay dismisses, main interface revealed

---

## State Management

The onboarding state is managed with these variables:

```
hasCompletedOnboarding: boolean — controls whether overlay is shown
currentStep: number (0-2) — which step is active
provider: string — selected AI provider
apiKey: string — entered API key
model: string — selected model
```

The `hasCompletedOnboarding` flag is persisted in the application config. Once set to `true`, the onboarding overlay will not appear again on subsequent launches.

---

## Error Handling

- **Invalid API key**: Not validated during onboarding. On first AI request, if the key is invalid, the AI panel shows an error with a "Check your API key in Settings" message. This avoids blocking onboarding with network requests.
- **Network offline**: Same as above. The onboarding doesn't require network connectivity.
- **Skip without provider**: If the user skips onboarding, the AI panel empty state includes a "Configure your AI provider" suggestion that links to the Settings panel.

---

## Accessibility

- Full-screen overlay uses `role="dialog"` and `aria-modal="true"`
- Progress dots use `aria-current="step"` on the active dot
- Form fields have proper `label` associations
- Keyboard navigation: Tab through form fields, Enter to submit
- Escape key dismisses onboarding (treated as "Skip")
- Focus is trapped within the onboarding overlay

---

## Future Improvements

1. **Branded illustration** in the welcome step (replacing the empty 200px space)
2. **Provider auto-detection** — check if environment variables have API keys already set
3. **Test connection** button during provider configuration for immediate validation
4. **Interactive suggestions** on the ready step that auto-populate the AI input
5. **Progressive onboarding** — optional post-onboarding tooltip tour for advanced features
6. **Onboarding analytics** — track step completion rates and skip rates to identify friction points
