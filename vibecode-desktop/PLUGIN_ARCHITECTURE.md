# PLUGIN_ARCHITECTURE.md — VibeCode Desktop Plugin System

## Overview

The VibeCode Plugin System allows third-party extensions to run inside the desktop
environment with strong isolation, capability-based permissions, and lifecycle management.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PluginManager                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Registry  │  │ Sandbox  │  │    PluginAPI Proxy    │  │
│  │          │  │          │  │  ┌────┐ ┌────┐ ┌───┐  │  │
│  │ manifest │  │ require  │  │  │ fs │ │cmd │ │tlm│  │  │
│  │ validate │  │ console  │  │  └────┘ └────┘ └───┘  │  │
│  │ resolve  │  │ timers   │  │  ┌────┐ ┌────┐        │  │
│  │ watch    │  │ memory   │  │  │ipc │ │net │        │  │
│  │          │  │ rate-lim │  │  └────┘ └────┘        │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## State Machine

```
unloaded → loaded → activated → deactivated → unloaded
                      ↓              ↓
                    error ←─────── error
                      ↓              ↓
                   unloaded       unloaded
```

Valid transitions:
- `unloaded → loaded`: Plugin manifest validated, sandbox created
- `loaded → activated`: Plugin code initialized, capabilities granted
- `loaded → unloaded`: Plugin removed without activation
- `activated → deactivated`: Plugin stopped, resources released
- `deactivated → activated`: Plugin restarted
- `deactivated → unloaded`: Plugin fully removed
- `error → loaded`: Recovery attempt
- `error → unloaded`: Cleanup from error state

## Sandbox Architecture

Each plugin runs in an isolated sandbox with:
- **No direct require()**: `require` is set to `undefined`
- **Scoped console**: All log output prefixed with `[plugin:<id>]`
- **Tracked timers**: setTimeout/setInterval tracked for CPU accounting
- **Memory monitoring**: Per-plugin memory usage tracked
- **IPC rate limiting**: 100 calls/second default per plugin
- **Prototype pollution prevention**: `Object.setPrototypeOf` blocked

## API Surface

### fs
- `fs.read(path)` — Read file (scoped to declared paths)
- `fs.write(path, content)` — Write file (scoped to declared paths)

### command
- `command.register(id, handler)` — Returns disposable
- `command.execute(id, ...args)` — Execute registered command

### telemetry
- `telemetry.emit(event, data)` — Events prefixed with plugin ID

### ipc
- `ipc.send(channel, ...args)` — Send IPC message

## Security Model

### Capability Consent
- Plugins declare required capabilities in manifest
- Consent-requiring capabilities prompt user on first use
- All capability usage logged to audit service
- Capabilities can be revoked at runtime (takes effect immediately)

### Manifest Validation
Required fields: `id`, `name`, `version`, `description`, `main`, `apiVersion`, `capabilities`
- Missing fields → rejected at scan
- Duplicate IDs → rejected at registration
- Invalid types → rejected at validation

## Registry & Discovery

- Multiple plugin directories supported
- File watching for hot reload on manifest changes
- Dependency resolution (topological sort)
- Command ID conflict detection
- Invalid manifests don't crash registry scan
