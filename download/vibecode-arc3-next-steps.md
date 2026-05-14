# VibeCode Desktop — Next Steps (ARC 3)

## Immediate (Next Session)

### 1. Fix Tailwind Build Pipeline
- Resolve content path resolution for Vite root vs project root
- Ensure all utility classes (flex, items-center, gap, text-sm, etc.) are generated
- Consider moving to Vite root = project root with explicit HTML entry point

### 2. Real Provider Integration Testing
- Test OpenAI streaming with actual API key
- Test Anthropic Claude streaming
- Verify provider health checks work
- Test fallback routing between providers

### 3. Monaco Editor Integration
- Add @monaco-editor/react package
- Replace basic code display with full Monaco editor
- Syntax highlighting for TypeScript, JavaScript, Python, etc.
- File diff view for AI-proposed changes

### 4. Execution Engine End-to-End
- Connect proposal cards to real file operations
- Implement file_write, file_edit step executors
- Add rollback/undo for executed steps
- Show live execution progress in workspace

## Short Term (2-3 Sessions)

### 5. Memory Intelligence Upgrade
- Add semantic search (embedding-based) 
- Implement memory graph relationships
- Add project-scoped memory timelines
- Implement automatic summarization of conversations

### 6. Session Continuity Polish
- Open tab restoration on restart
- Scroll position restoration per file
- "What changed since last session" feature
- Multi-workspace switching

### 7. App Icon Integration
- Wait for icon file from user
- Generate all formats: icns, ico, png (multiple sizes)
- Integrate across: app icon, dock, titlebar, onboarding, splash

### 8. Electron Builder Packaging
- Configure Windows NSIS installer
- Configure macOS DMG
- Configure Linux AppImage
- Test production builds

## Medium Term (4-6 Sessions)

### 9. Autonomous Iteration Loops
- Plan → Execute → Validate → Analyze → Retry → Revise cycle
- Approval only at risk boundaries
- Automatic error analysis and retry strategies

### 10. Reasoning Visibility
- Execution reasoning summaries
- Planning rationale display
- Dependency analysis visualization
- Blocker explanations

### 11. Workspace Knowledge Graph
- Project architecture analysis
- Dependency mapping
- Convention detection
- Code navigation

### 12. Auto-Update System
- electron-updater integration
- GitHub releases as update source
- Background download + install on restart
