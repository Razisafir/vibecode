# VibeCode Desktop — Current Blockers

## Critical

1. **Tailwind Utility Classes Not Generating**
   - Cause: Content path resolution fails when Vite root is set to `src/renderer/`
   - Impact: Tailwind utility classes (flex, gap, items-center, etc.) are not in CSS output
   - Mitigation: Custom CSS classes work correctly and cover all styling needs
   - Fix: Change Vite root back to project root with explicit HTML entry point

2. **No Real AI Provider Testing**
   - Cause: No API keys configured in dev environment
   - Impact: Can't test streaming, proposal generation, or execution engine end-to-end
   - Fix: User needs to provide at least one API key (OpenAI/Anthropic/Google)

## Important

3. **node-pty Native Module Not Compiled**
   - Cause: node-pty requires native compilation for the target platform
   - Impact: Terminal falls back to child_process.spawn (limited functionality)
   - Fix: Add node-pty to dependencies and configure electron-rebuild

4. **No Monaco Editor**
   - Cause: Not yet integrated
   - Impact: Basic syntax highlighting only, no code editing, no diff view
   - Fix: Add @monaco-editor/react package and integrate into Workspace component

5. **No Application Icon**
   - Cause: Waiting for user to provide icon file
   - Impact: Default Electron icon used
   - Fix: User provides icon → generate all formats → integrate

## Nice to Have

6. **No Auto-Update System**
   - electron-updater not configured
   - Need GitHub releases as update source

7. **No Production Packaging Tested**
   - electron-builder configured but not tested with actual builds
   - Need to test on Windows, macOS, and Linux

8. **No Telemetry or Error Reporting**
   - No crash reporting
   - No usage analytics
