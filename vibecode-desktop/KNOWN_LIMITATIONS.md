# VibeCode Desktop — Known Limitations

Version: 0.2.0
Date: 2026-05-14

---

## Critical Limitations

### 1. API Key Storage Not Encrypted
API keys for AI providers are stored in electron-store, which uses unencrypted JSON files on disk. This is acceptable for single-user machines but may be insufficient for shared computers. Migration to electron's safeStorage API or OS keychain is planned for a future release.

### 2. No Code Signing
The application is not currently signed with code signing certificates. This means:
- macOS: Users will see a "cannot verify developer" warning on first launch
- Windows: SmartScreen will show a warning
- Solution: Right-click → Open (macOS) or "More info" → "Run anyway" (Windows)

### 3. No Real Terminal (PTY)
The terminal system uses a simplified implementation. Full PTY support with node-pty is planned for a future release. Currently, terminal operations are limited.

## Performance Limitations

### 4. Large Workspace Indexing
Workspaces with more than 10,000 files may experience slower file search and fuzzy search operations. The indexing system uses a simple file walk that is not optimized for very large repositories.

### 5. Memory Store Scaling
The memory store is bounded to 10,000 entries per project with LRU eviction. Projects with extensive conversation histories may see older memories evicted.

### 6. AI Provider Latency
AI chat responses depend on external provider APIs and are subject to network conditions. No local caching of AI responses is implemented.

## Feature Limitations

### 7. No Cloud Sync
Settings, memory, and sessions are stored locally only. Cloud sync for cross-device access is planned for a future release.

### 8. No Team Collaboration
VibeCode is currently a single-user application. Team features including shared workspaces, collaborative editing, and team memory are planned.

### 9. No Plugin System
VibeCode does not currently support third-party plugins or extensions. A plugin API is planned for a future release.

### 10. Limited Git Integration
VibeCode detects git repositories but does not provide full git integration (branch management, diff viewing, merge conflict resolution). This is planned for a future release.

## Platform Limitations

### 11. macOS ARM64 (Apple Silicon)
The application runs natively on Apple Silicon through Electron's universal binary support. Performance should be excellent on both Intel and ARM64 Macs.

### 12. Linux Wayland
The application may have minor rendering issues on Wayland compositors due to Electron's X11-focused implementation. Use X11/XWayland for best results.

### 13. Windows ARM64
Windows ARM64 is supported through x64 emulation. Native ARM64 builds may be available in the future.

## Security Limitations

### 14. Renderer Sandbox Disabled
`sandbox: false` is set in webPreferences to support native Node.js modules in the preload script. Context isolation is enabled, which provides the primary security boundary.

### 15. Command Execution
The execution engine can run shell commands. While these require user approval and are audit-logged, there is no static analysis of commands for malicious patterns.

## Browser/Renderer Limitations

### 16. Monaco Editor Not Integrated
The current editor is basic. Full Monaco Editor integration with syntax highlighting, IntelliSense, and multi-cursor editing is planned.

### 17. No Multiple Tabs
Only one file can be viewed at a time in the editor. Tab-based multi-file editing is planned.

### 18. No Find & Replace
In-editor find and replace functionality is not yet implemented.

---

## Reporting New Limitations

If you discover a limitation not listed here, please open an issue at:
https://github.com/Razisafir/vibecode/issues
