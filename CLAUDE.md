# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automaker is an autonomous AI development studio built as an npm workspace monorepo. It provides a Kanban-based workflow where AI agents (powered by Claude Agent SDK) implement features in isolated git worktrees.

## Common Commands

```bash
# Development
npm run dev                 # Interactive launcher (choose web or electron)
npm run dev:web             # Web browser mode (localhost:3007)
npm run dev:electron        # Desktop app mode
npm run dev:electron:debug  # Desktop with DevTools open

# Building
npm run build               # Build web application
npm run build:packages      # Build all shared packages (required before other builds)
npm run build:electron      # Build desktop app for current platform
npm run build:server        # Build server only

# Testing
npm run test                # E2E tests (Playwright, headless)
npm run test:headed         # E2E tests with browser visible
npm run test:server         # Server unit tests (Vitest)
npm run test:packages       # All shared package tests
npm run test:all            # All tests (packages + server)

# Single test file
npm run test:server -- tests/unit/specific.test.ts

# Linting and formatting
npm run lint                # ESLint
npm run format              # Prettier write
npm run format:check        # Prettier check
```

## Architecture

### Monorepo Structure

```
automaker/
├── apps/
│   ├── ui/           # React + Vite + Electron frontend (port 3007)
│   └── server/       # Express + WebSocket backend (port 3008)
└── libs/             # Shared packages (@automaker/*)
    ├── types/        # Core TypeScript definitions (no dependencies)
    ├── utils/        # Logging, errors, image processing, context loading
    ├── prompts/      # AI prompt templates
    ├── platform/     # Path management, security, process spawning
    ├── model-resolver/    # Claude model alias resolution
    ├── dependency-resolver/  # Feature dependency ordering
    └── git-utils/    # Git operations & worktree management
```

### Package Dependency Chain

Packages can only depend on packages above them:

```
@automaker/types (no dependencies)
    ↓
@automaker/utils, @automaker/prompts, @automaker/platform, @automaker/model-resolver, @automaker/dependency-resolver
    ↓
@automaker/git-utils
    ↓
@automaker/server, @automaker/ui
```

### Key Technologies

- **Frontend**: React 19, Vite 7, Electron 39, TanStack Router, Zustand 5, Tailwind CSS 4
- **Backend**: Express 5, WebSocket (ws), Claude Agent SDK, node-pty
- **Testing**: Playwright (E2E), Vitest (unit)

### Server Architecture

The server (`apps/server/src/`) follows a modular pattern:

- `routes/` - Express route handlers organized by feature (agent, features, auto-mode, worktree, etc.)
- `services/` - Business logic (AgentService, AutoModeService, FeatureLoader, TerminalService)
- `providers/` - AI provider abstraction (currently Claude via Claude Agent SDK)
- `lib/` - Utilities (events, auth, worktree metadata)

### Frontend Architecture

The UI (`apps/ui/src/`) uses:

- `routes/` - TanStack Router file-based routing
- `components/views/` - Main view components (board, settings, terminal, etc.)
- `store/` - Zustand stores with persistence (app-store.ts, setup-store.ts)
- `hooks/` - Custom React hooks
- `lib/` - Utilities and API client

## Data Storage

### Per-Project Data (`.automaker/`)

```
.automaker/
├── features/              # Feature JSON files and images
│   └── {featureId}/
│       ├── feature.json
│       ├── agent-output.md
│       └── images/
├── context/               # Context files for AI agents (CLAUDE.md, etc.)
├── settings.json          # Project-specific settings
├── spec.md               # Project specification
└── analysis.json         # Project structure analysis
```

### Global Data (`DATA_DIR`, default `./data`)

```
data/
├── settings.json          # Global settings, profiles, shortcuts
├── credentials.json       # API keys
├── sessions-metadata.json # Chat session metadata
└── agent-sessions/        # Conversation histories
```

## Import Conventions

Always import from shared packages, never from old paths:

```typescript
// ✅ Correct
import type { Feature, ExecuteOptions } from '@automaker/types';
import { createLogger, classifyError } from '@automaker/utils';
import { getEnhancementPrompt } from '@automaker/prompts';
import { getFeatureDir, ensureAutomakerDir } from '@automaker/platform';
import { resolveModelString } from '@automaker/model-resolver';
import { resolveDependencies } from '@automaker/dependency-resolver';
import { getGitRepositoryDiffs } from '@automaker/git-utils';

// ❌ Never import from old paths
import { Feature } from '../services/feature-loader'; // Wrong
import { createLogger } from '../lib/logger'; // Wrong
```

## Key Patterns

### Event-Driven Architecture

All server operations emit events that stream to the frontend via WebSocket. Events are created using `createEventEmitter()` from `lib/events.ts`.

### Git Worktree Isolation

Each feature executes in an isolated git worktree, created via `@automaker/git-utils`. This protects the main branch during AI agent execution.

### Context Files

Project-specific rules are stored in `.automaker/context/` and automatically loaded into agent prompts via `loadContextFiles()` from `@automaker/utils`.

### Model Resolution

Use `resolveModelString()` from `@automaker/model-resolver` to convert model aliases:

- `haiku` → `claude-haiku-4-5`
- `sonnet` → `claude-sonnet-4-20250514`
- `opus` → `claude-opus-4-5-20251101`

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key (or use Claude Code CLI auth)
- `PORT` - Server port (default: 3008)
- `DATA_DIR` - Data storage directory (default: ./data)
- `ALLOWED_ROOT_DIRECTORY` - Restrict file operations to specific directory
- `AUTOMAKER_MOCK_AGENT=true` - Enable mock agent mode for CI testing

---

## Fork Strategy

This is a fork of [AutoMaker-Org/automaker](https://github.com/AutoMaker-Org/automaker). We maintain it using a **history-preserving rebase** strategy for continuous upstream sync.

### Critical Rules for AI Agents

**BEFORE making any changes, understand:**

1. **Check FORK.md** - Contains the customizations registry and safe zones
2. **Prefer new files** - Never modify hot zone files unless absolutely necessary
3. **Use extension points** - The codebase has designed insertion points

### Safe Zones (Add Code Here)

These locations rarely change upstream and are safe for customizations:

```
libs/your-package/           # NEW packages (zero conflict risk)
apps/server/src/routes/your-feature/  # NEW route modules
apps/server/src/services/your-service.ts  # NEW service files
apps/server/src/config/      # NEW config files
```

### Hot Zones (DO NOT Modify)

These files change frequently upstream. Modifying them causes rebase conflicts:

| File | Risk | Alternative |
|------|------|-------------|
| `apps/server/src/services/auto-mode-service.ts` | VERY HIGH | Create new service |
| `apps/ui/src/store/app-store.ts` | VERY HIGH | Create new store slice |
| `apps/server/src/index.ts` | HIGH | Minimal registration only |
| `apps/server/src/services/agent-service.ts` | HIGH | Extend via composition |
| `apps/ui/src/lib/http-api-client.ts` | HIGH | Create wrapper |

### How to Add Features Safely

**1. New Package (Recommended for major features):**
```bash
mkdir -p libs/your-feature/src
# Create package.json, tsconfig.json, src/index.ts
# Already included in workspace via libs/*
```

**2. New Route Module:**
```typescript
// apps/server/src/routes/your-feature/index.ts
export function createYourRoutes(services, events): Router {
  const router = Router();
  // Your endpoints
  return router;
}

// Then ONE LINE in apps/server/src/index.ts:
app.use('/api/your-feature', createYourRoutes(services, events));
```

**3. New Provider:**
```typescript
// apps/server/src/providers/your-provider.ts
export class YourProvider extends BaseProvider {
  // Implementation
}

// Add to provider-factory.ts at TOP of if-chain
if (lowerModel.startsWith('your-')) {
  return new YourProvider();
}
```

**4. Feature Flags (for behavior changes):**
```typescript
// apps/server/src/config/fork-features.ts (NEW FILE)
export const FORK_FEATURES = {
  useCustomProvider: process.env.USE_CUSTOM_PROVIDER === 'true',
};
```

### Syncing with Upstream

```bash
# Check for updates
./scripts/sync-upstream.sh --check-only

# Preview sync
./scripts/sync-upstream.sh --dry-run

# Perform sync
./scripts/sync-upstream.sh

# Test after sync
npm run test:all
```

### When Modifying Existing Files

If you MUST modify an existing file:

1. **Document in FORK.md** - Add to "Modified Files" section
2. **Keep changes minimal** - Smaller diffs = easier rebases
3. **Use clear markers:**
   ```typescript
   // FORK: Your change description
   yourCustomCode();
   // END FORK
   ```
4. **Prefer composition** - Wrap/extend rather than modify

### Extension Points Reference

| Extension Point | Location | Pattern |
|-----------------|----------|---------|
| AI Providers | `providers/provider-factory.ts` | Add to if-chain |
| API Routes | `routes/` directory | New module + register |
| Services | `services/` directory | New file |
| UI Views | `apps/ui/src/routes/` | New route file (TanStack auto-registers) |
| Types | `libs/types/src/` | New type file + export |
| Prompts | `libs/prompts/src/` | New file or use merge system |

### See Also

- `FORK.md` - Full fork documentation, customization registry, troubleshooting
- `scripts/sync-upstream.sh` - Upstream sync tool
- `.github/workflows/upstream-check.yml` - Automated upstream notifications
