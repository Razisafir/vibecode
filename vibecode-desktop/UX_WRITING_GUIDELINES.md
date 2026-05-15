# VibeCode Desktop — UX Writing Guidelines

> **ARC 7 Phase 8 — Writing Standards**
> The definitive reference for all user-facing text in VibeCode. Every label, message, and microcopy decision should follow these guidelines.

---

## Core Writing Principles

1. **Be specific, not vague.** "3 files updated" is better than "Changes applied." "Connection failed" is better than "Something went wrong."
2. **Be calm, not dramatic.** "Completed" is better than "All done!" "Failed" is better than "Uh oh!" No exclamation marks in status or error messages.
3. **Be helpful, not blaming.** "Check your API key and try again" is better than "Invalid API key." "This directory doesn't exist yet" is better than "Invalid path."
4. **Be human, not robotic.** "You can always undo changes" is better than "Operation is reversible." "Step 1 of 3" is better than "1/3."

---

## Button Labels

### Pattern: Verb + Object

All button labels must follow the **verb + object** pattern. This tells the user both what will happen and what it will affect.

| Do | Don't | Why |
|----|-------|-----|
| "Approve and Run" | "Approve" | "Approve" alone doesn't communicate that execution follows. The user might think they're just acknowledging. |
| "Undo Changes" | "Rollback" | "Rollback" is jargon. "Undo Changes" uses universal language and specifies what is being undone. |
| "Try Again" | "Retry" | "Retry" is technical shorthand. "Try Again" is natural language that feels supportive rather than mechanical. |
| "Add Provider" | "Add" | "Add" could mean add anything. "Add Provider" specifies the object. |
| "Save Changes" | "Save" | In a settings context, "Save" is ambiguous. "Save Changes" confirms the user's intent. |
| "Remove File" | "Delete" | "Remove" is less destructive-sounding than "Delete" and more precise about what happens (the file is removed from scope, not necessarily destroyed). |

### Confirmation Buttons

When a button confirms a destructive or significant action, the label must restate the action:

| Context | Confirmation Label | Cancel Label |
|---------|-------------------|--------------|
| Undo changes | "Yes, Undo" | "Cancel" |
| Remove provider | "Yes, Remove" | "Cancel" |
| Reject proposal | "Yes, Reject" | "Cancel" |

Never use generic "OK" or "Confirm" for destructive actions — the user must be able to understand what will happen by reading only the button label.

### Navigation Buttons

Navigation buttons use simple directional language:

| Button | Usage |
|--------|-------|
| "Continue" | Move to next step in a flow |
| "Back" | Return to previous step |
| "Get Started" | Complete onboarding and enter the app |
| "Skip setup" | Bypass optional configuration |

---

## Error Messages

### Pattern: What Happened + Why + What to Do

Every error message must contain three elements:

1. **What happened** — A factual description of the failure.
2. **Why it happened** — The most likely cause, if known.
3. **What to do next** — A concrete action the user can take.

### Examples

| Situation | Bad | Good |
|-----------|-----|------|
| API key rejected | "Invalid API key" | "Connection failed. Your API key was not accepted — check that it's correct and hasn't expired." |
| Directory not found | "Path invalid" | "This directory doesn't exist. Enter a valid path or create the directory first." |
| Provider timeout | "Provider error" | "The AI provider didn't respond in time. Check your internet connection and try again." |
| Execution failed | "Step failed" | "Step 2 failed: Run Command. The command exited with an error. Review the output and try again." |
| Diff unavailable | "No diff" | "No diff available — the file may not exist yet or content is not available." |
| File write conflict | "Write error" | "Couldn't write to this file. It may be open in another application or you may not have permission to edit it." |

### Blame-Free Language

Never attribute errors to the user. The system is responsible for communicating clearly; if the user made a mistake, the error message should help them recover without judgment.

| Don't | Do |
|-------|----|
| "You entered an invalid path" | "This directory doesn't exist" |
| "You forgot to configure a provider" | "No AI provider is configured yet" |
| "You must approve the proposal first" | "Approve the proposal to continue" |
| "Your API key is wrong" | "Your API key was not accepted" |

---

## Status Messages

### Tense Rules

| State | Tense | Examples |
|-------|-------|----------|
| In progress | Present participle (-ing) | "Writing", "Thinking", "Executing", "Connecting" |
| Completed | Past tense or adjective | "Completed", "Connected", "Available" |
| Failed | Past tense or adjective | "Failed", "Unavailable", "Connection failed" |
| Pending | Present tense or adjective | "Pending Review", "Waiting", "Ready" |

### Proposal Status Labels

| Status | Label | Icon |
|--------|-------|------|
| `pending` | "Pending Review" | Pulsing dot |
| `approved` | "Approved" | Checkmark |
| `rejected` | "Rejected" | X mark |
| `executing` | "Executing" | Spinner |
| `completed` | "Completed" | Checkmark |
| `failed` | "Failed" | X mark |

### Step Status Labels

| Status | Label | Icon |
|--------|-------|------|
| `pending` | Circle outline | — |
| `running` | Spinner | Spinning ring |
| `completed` | Checkmark | Green check |
| `failed` | X mark | Red X |

### Provider Health Labels

| Condition | Label | Color |
|-----------|-------|-------|
| Connected with low latency | "Available" | Success (green) |
| Connected with high latency | "Available" (show ms) | Success (green) |
| Not responding | "Unavailable" | Error (red) |
| Never tested | "Unknown" | Warning (amber) |

---

## Risk Language

### Risk Level Labels

Risk language must be descriptive and actionable, not frightening or dismissive.

| Level | Label | Explanation | Tone |
|-------|-------|-------------|------|
| Low | "LOW" | "This change is straightforward and unlikely to cause issues. It creates new files or makes small, well-defined edits." | Reassuring — the user can proceed confidently. |
| Medium | "MEDIUM" | "This change modifies existing files. Review the steps carefully — you can always undo if needed." | Cautionary but supportive — the user should look, but knows undo is available. |
| High | "HIGH" | "This change is significant and affects multiple files or runs commands. Take a moment to review each step before proceeding." | Respectful of the user's time — slow down, but no fear. |

### Words Never to Use

| Don't Use | Use Instead | Why |
|-----------|-------------|-----|
| "Dangerous" | "Significant" | "Dangerous" implies harm is likely; "significant" implies scope is large. |
| "Risky" | "Review carefully" | "Risky" creates anxiety; "review carefully" empowers the user. |
| "Warning" (in risk context) | "Take a moment to review" | "Warning" is alarmist; the invitation to pause is respectful. |
| "Critical" | "Important" | "Critical" implies disaster; "important" implies attention is warranted. |
| "Safe" | "Straightforward" | "Safe" implies other options are unsafe; "straightforward" describes the complexity. |
| "Catastrophic" | "Significant changes" | "Catastrophic" is hyperbolic and should never appear in UI text. |

### Risk Meter Visual

The risk meter uses a horizontal bar that fills proportionally:

- Low: 33% fill, green (`bg-success`)
- Medium: 66% fill, amber (`bg-warning`)
- High: 100% fill, red (`bg-error`)

The fill percentage is proportional to risk, not to the number of files affected. A single file deletion is high risk; 10 new file creations are low risk.

---

## Onboarding Writing

### Principle: Outcomes, Not Features

Onboarding text must focus on what the user will achieve, not what features exist. The user is asking "Why should I trust this tool?" not "What can this tool do?"

| Don't | Do | Why |
|-------|----|-----|
| "AI-native workspace" | "Your calm, intelligent engineering partner" | Features don't build trust; relationships do. |
| "Multi-provider architecture" | "Connect your AI provider" | Architecture is an implementation detail; connection is a user action. |
| "Intelligent memory system" | "VibeCode will analyze your codebase, remember decisions, and provide context-aware assistance" | The word "intelligent" tells; the description shows. |
| "Advanced execution engine" | "You can always undo changes" | The engine doesn't matter to the user; the safety net does. |
| "Proposal-based workflow" | "Review everything before it happens" | "Proposal" is jargon; "review before it happens" is the benefit. |

### Step Descriptions

Each onboarding step description must answer: **What will this do for me?**

| Step | Title | Description |
|------|-------|-------------|
| Welcome | "Welcome to VibeCode" | "Your calm, intelligent engineering partner. Build with confidence — VibeCode understands your code, suggests changes, and lets you review everything before it happens." |
| Provider | "Connect Your AI Provider" | "Connect your AI provider to get started. Your key is stored securely on your device — never sent to our servers." |
| Model | "Configure Model Settings" | "Select a default model and adjust settings for your provider. You can always change these later in Settings." |
| Workspace | "Set Up Your Workspace" | "Choose a directory for your projects. VibeCode will analyze your codebase, remember decisions, and provide context-aware assistance." |
| Ready | "You're All Set!" | "You are ready to build. Ask the AI assistant anything, open a project, or explore the workspace. Remember — you can always undo changes." |

### Trust Messages

Trust-building messages are placed at strategic anxiety points:

- **API key input:** "Your key is stored locally with obfuscation and never sent to our servers."
- **Provider configuration:** "Your key is stored securely on your device — never sent to our servers."
- **Onboarding footer:** "Your data stays on your device."
- **Proposal approval:** "You can undo all changes after they are applied."

---

## Empty States

### Principle: Suggest Concrete Actions

Empty states must never show just "Nothing here" or a blank panel. Every empty state should suggest at least one concrete action the user can take.

| Component | Bad Empty State | Good Empty State |
|-----------|----------------|------------------|
| AI Panel | "No messages yet" | "Ask the AI assistant anything — try: 'Help me understand this project' or 'Add a new feature'" |
| File Explorer | "No files" | "Open a workspace to see your project files" |
| Memory Panel | "No memories" | "Memories will appear as you work with the AI. Open a project and start a conversation to begin." |
| Terminal | "Terminal ready" | "Type a command and press Enter to run it" |
| Search Results | "No results" | "No files found for '[query]'. Try a different search term or open a workspace first." |

### Empty State Suggestions for AI Panel

The AI panel shows 4 suggested prompts when empty:

1. "Help me understand this project" — Analytical, low-risk
2. "Add a new feature" — Creative, forward-looking
3. "Find and fix issues" — Diagnostic, practical
4. "Write tests for my code" — Constructive, quality-focused

These suggestions are task-oriented, not feature-oriented. They describe what the user wants to accomplish, not what the AI can do.

---

## Confirmation Dialogs

### Pattern: State the Action Clearly + Offer a Way Out

Every confirmation dialog must:

1. **State the action in plain language** — The user should understand what will happen by reading the dialog text alone, without context from the button that triggered it.
2. **Use a confirmation button that restates the action** — Not "OK" or "Confirm."
3. **Always offer a "Cancel" option** — The user must be able to back out without consequence.

### Examples

**Undo confirmation:**
> **"Undo these changes?"**
> [Yes, Undo] [Cancel]

**Provider removal:**
> **"Remove this provider? You'll need to re-add it to use it again."**
> [Yes, Remove] [Cancel]

**Proposal rejection:**
> **"Reject this proposal? The suggested changes will not be applied."**
> [Yes, Reject] [Cancel]

### What Not to Do

| Don't | Why |
|-------|-----|
| "Are you sure?" | Vague — sure about what? |
| "Confirm action" | Generic — which action? |
| "Do you want to proceed?" | Proceed with what? |
| "OK" / "Yes" as confirmation buttons | The user must read the dialog text to understand what "OK" means. The button label should be self-explanatory. |

---

## Progress and Loading

### Use "Step" Not "Phase"

When describing execution progress, use "step" as the unit of measurement. "Phase" implies a stage in a larger process and is unnecessarily abstract. "Step" is concrete and familiar.

| Don't | Do |
|-------|----|
| "Phase 1 of 3" | "Step 1 of 3" |
| "Execution phase" | "Execution step" |
| "Entering planning phase" | "Planning" |

### Show What's Happening, Not Just a Spinner

Loading states must communicate what is being loaded or processed, not just that something is happening.

| Situation | Bad | Good |
|-----------|-----|------|
| AI thinking | Spinner only | "Thinking..." with animated dots |
| AI writing response | Spinner only | "Writing" with pulsing indicator |
| Provider testing | Spinner only | "Testing connection..." |
| Diff loading | Spinner only | "Loading diff..." |
| File search | Spinner only | "Searching..." |

### Execution Progress

During execution, the step timeline shows real-time status:

- **Running step:** Spinner icon + step title in primary text color
- **Completed step:** Green checkmark + step title + "View output" link (for command steps)
- **Failed step:** Red X mark + step title + error description
- **Pending step:** Gray circle + step title in muted text color

The progress bar at the bottom of the proposal card fills proportionally based on completed steps vs total steps.

---

## Capitalization and Punctuation

### Capitalization

| Element | Style | Example |
|---------|-------|---------|
| Button labels | Sentence case | "Approve and Run", "Try Again" |
| Section headers | Title case (when using SectionHeader component) | "AI Providers", "Workspace", "Memory" |
| Status labels | Sentence case | "Pending Review", "Connection failed" |
| Risk levels | ALL CAPS (visual badge only) | "LOW", "MEDIUM", "HIGH" |
| Type labels | Sentence case | "New File", "Edit File", "Remove File" |
| Tab labels | Title case | "Steps", "Files", "Diff Preview", "Details" |
| Keyboard shortcuts | Abbreviated | "Cmd+K", "Cmd+B", "Cmd+J" |

### Punctuation

| Element | Rule | Example |
|---------|------|---------|
| Button labels | No trailing punctuation | "Approve and Run" not "Approve and Run." |
| Status messages | No trailing period | "Completed" not "Completed." |
| Descriptions | Full sentences with period | "This change modifies existing files." |
| Error messages | Full sentences with period | "Connection failed. Check your API key and try again." |
| Confirmation questions | Question mark | "Undo these changes?" |
| Empty state hints | No trailing period | "Open a workspace to see your project files" |

---

## Number Formatting

| Element | Format | Example |
|---------|--------|---------|
| File counts | "N file(s)" with plural | "3 files", "1 file" |
| Step counts | "N step(s)" with plural | "5 steps", "1 step" |
| Duration < 1s | Milliseconds | "450ms" |
| Duration 1s–60s | Seconds, 1 decimal | "3.2s" |
| Duration > 60s | Minutes, 1 decimal | "2.5m" |
| Latency | Milliseconds | "142ms" |
| Context window | Kilobytes, no decimal | "128k ctx" |
| Token counts | Integer | "4096" |

---

## Glossary: Preferred Terms

| Preferred Term | Avoid | Context |
|---------------|-------|---------|
| Undo | Rollback | User-facing action to reverse changes |
| Reversible | Rollbackable | Property of a change that can be undone |
| Proposal | Plan (user-facing) | A set of changes suggested by the AI |
| Step | Phase | Individual action within an execution |
| Try Again | Retry | Button to re-attempt a failed step |
| Provider | LLM, Model Provider | AI service (OpenAI, Anthropic, etc.) |
| Workspace | Project, Repo | Directory containing the user's code |
| Memory | Context, Knowledge | Stored information about the project |
| Approve and Run | Execute, Apply | User confirmation to proceed with changes |
| Changes | Mutations, Operations | Modifications made by the AI |
