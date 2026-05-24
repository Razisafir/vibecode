// ============================================================
// VibeCode Desktop — Main Entry Point
// ============================================================
//
// Thin boot file. All application logic has been extracted to
// the runtime module (src/system/runtime/lifecycle.ts).
// This file just calls boot() and that's it.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { boot } from '../system/runtime/lifecycle';

// That's it. The lifecycle module owns everything.
boot();
