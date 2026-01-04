# Fork Documentation

This repository is a fork of [AutoMaker-Org/automaker](https://github.com/AutoMaker-Org/automaker).

## Fork Strategy

We maintain this fork using a **history-preserving rebase** strategy, similar to how Cursor maintains their VS Code fork. This allows us to:

1. Continuously sync with upstream improvements
2. Keep our customizations cleanly separated
3. Avoid force-push requirements
4. Maintain a clear audit trail of changes

## Quick Reference

```bash
# Check if upstream has new commits
./scripts/sync-upstream.sh --check-only

# Preview what sync would do
./scripts/sync-upstream.sh --dry-run

# Perform full sync
./scripts/sync-upstream.sh

# After sync, run tests
npm run test:all

# Push changes (no force needed)
git push origin main
```

## Upstream Information

| Property        | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Upstream Repo   | [AutoMaker-Org/automaker](https://github.com/AutoMaker-Org/automaker) |
| Upstream Remote | `upstream`                                                            |
| Upstream Branch | `main`                                                                |
| Fork Base Tag   | `fork-base`                                                           |

## Customizations Registry

Track all fork-specific changes here. This helps during rebases and ensures nothing is lost.

### New Files (Zero Conflict Risk)

| File/Directory                         | Purpose               | Added Date |
| -------------------------------------- | --------------------- | ---------- |
| `scripts/sync-upstream.sh`             | Upstream sync tooling | 2026-01-04 |
| `FORK.md`                              | This documentation    | 2026-01-04 |
| `.github/workflows/upstream-check.yml` | Upstream notification | 2026-01-04 |

### Modified Files (Track Carefully)

| File         | Change Description          | Risk Level |
| ------------ | --------------------------- | ---------- |
| `CLAUDE.md`  | Added fork strategy section | Low        |
| `.gitignore` | (if modified)               | Low        |

### New Packages (Recommended for Features)

Create new features as separate packages in `libs/` to minimize conflicts:

```
libs/
└── your-package/           # YOUR CUSTOM PACKAGE
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   └── index.ts
    └── tests/
```

Register in root `package.json` workspaces (already includes `libs/*`).

### New Routes (Safe Extension Point)

Add new API endpoints in `apps/server/src/routes/`:

```
apps/server/src/routes/
└── your-feature/           # YOUR CUSTOM ROUTES
    ├── index.ts
    └── routes/
        └── your-endpoint.ts
```

Register in `apps/server/src/index.ts` (one-line change).

## File Change Frequency Analysis

Based on git history analysis, here are the safest places to add customizations:

### Safe Zones (Rarely Changed - Low Conflict Risk)

**Libraries:**

- `libs/model-resolver/` - 1 change in history
- `libs/prompts/src/enhancement.ts` - 1 change
- `libs/prompts/src/merge.ts` - 1 change
- `libs/platform/src/subprocess.ts` - 1 change
- `libs/dependency-resolver/` - 1-2 changes

**Routes:**

- `apps/server/src/routes/backlog-plan/` - 1 change
- `apps/server/src/routes/pipeline/` - 1 change
- `apps/server/src/routes/mcp/` - 1 change
- `apps/server/src/routes/git.ts` - 1 change

### Hot Zones (Frequently Changed - Avoid Modifying)

| File                                            | Changes (6mo) | Recommendation       |
| ----------------------------------------------- | ------------- | -------------------- |
| `apps/server/src/services/auto-mode-service.ts` | 70            | Do NOT modify        |
| `apps/ui/src/store/app-store.ts`                | 28            | Do NOT modify        |
| `apps/server/src/index.ts`                      | 38            | Minimal changes only |
| `apps/server/src/services/agent-service.ts`     | 27            | Avoid if possible    |
| `apps/ui/src/lib/http-api-client.ts`            | 31            | Do NOT modify        |

## Sync Workflow

### How the Sync Works

We use a "merge bridge" technique that avoids force-push:

```
BEFORE:
upstream:  A───B───C───D───E───F  (new upstream commits)
                   │
main:              └───X───Y───Z  (your fork commits)
                       ↑
                   fork-base

AFTER:
upstream:  A───B───C───D───E───F
                               │
bridge:                        M  (merge -s ours)
                               │
main:                          └───X'───Y'───Z'  (rebased)
                                   ↑
                               fork-base (updated)
```

### Handling Conflicts

If `sync-upstream.sh` reports conflicts:

1. Resolve conflicts in the marked files
2. `git add <resolved-files>`
3. `git rebase --continue`
4. After completion, update the tag:
   ```bash
   git tag -f fork-base next-base
   git tag -d next-base
   ```

### Sync Schedule

Recommended: **Monthly sync** to stay close to upstream.

- More frequent = fewer conflicts per sync
- Less frequent = larger rebases, more conflicts

## Adding New Features (Best Practices)

### 1. Prefer New Files Over Modifications

```typescript
// GOOD: New file in new directory
// apps/server/src/routes/your-feature/index.ts

// BAD: Modifying hot files
// apps/server/src/services/auto-mode-service.ts
```

### 2. Use Feature Flags for Behavior Changes

```typescript
// apps/server/src/config/fork-features.ts (NEW FILE)
export const FORK_FEATURES = {
  useCustomProvider: process.env.USE_CUSTOM_PROVIDER === 'true',
  enableYourFeature: process.env.ENABLE_YOUR_FEATURE === 'true',
};

// In existing code (minimal change)
import { FORK_FEATURES } from './config/fork-features.js';

if (FORK_FEATURES.useCustomProvider) {
  // Your custom logic
} else {
  // Original upstream logic
}
```

### 3. Hook Into Extension Points

The codebase has natural extension points designed for customization:

**Provider Factory** (`apps/server/src/providers/provider-factory.ts`):

```typescript
// Add at TOP of the if-chain
if (lowerModel.startsWith('your-')) {
  return new YourProvider();
}
```

**New Services** (create new file):

```typescript
// apps/server/src/services/your-service.ts
export class YourService {
  constructor(private events: EventEmitter) {}
  // Your implementation
}
```

## Contributing Back to Upstream

If your change would benefit the community:

1. Create a separate branch from `upstream/main`
2. Make your change
3. Submit PR to upstream
4. Once merged, it will come back during next sync
5. Remove from your fork's patch stack

## Troubleshooting

### "Working tree is not clean"

Commit or stash your changes before syncing:

```bash
git stash
./scripts/sync-upstream.sh
git stash pop
```

### "fork-base tag not found"

First-time setup will create it automatically. Or manually:

```bash
git tag fork-base HEAD
```

### Rebase fails with many conflicts

Consider rebasing upstream/main in smaller chunks:

```bash
# Find intermediate commits
git log --oneline upstream/main | head -20

# Rebase to an earlier point first
git rebase --onto <earlier-commit> fork-base main
```

### Need to abort sync

```bash
git rebase --abort
git checkout main
```

## Releasing New Versions

### Quick Release (Recommended)

Use the `/release` skill:

```bash
/release patch "Bug fixes and improvements"
/release minor "New feature: custom provider support"
/release major "Breaking: API changes"
```

### Manual Release Process

1. **Bump version**:

   ```bash
   node apps/ui/scripts/bump-version.mjs patch  # or minor/major
   ```

2. **Commit the version bump**:

   ```bash
   git add apps/ui/package.json apps/server/package.json
   git commit -m "chore: release v<version>"
   ```

3. **Create and push tag**:

   ```bash
   git tag -a v<version> -m "Release v<version>"
   git push && git push --tags
   ```

4. **Create GitHub Release**:
   - Go to https://github.com/Fawwaz-2009/automaker/releases
   - Click "Create a new release"
   - Select the tag you just pushed
   - Add release notes
   - Publish

5. **GitHub Actions builds automatically**:
   - macOS: `.dmg` and `.zip`
   - Windows: `.exe`
   - Linux: `.AppImage` and `.deb`

### Download Artifacts

After the release workflow completes:

- Artifacts are attached to the GitHub release
- Users can download and install directly

### Auto-Updates (Future)

The `electron-updater` package is configured. To enable auto-updates:

1. Add update checking code to `apps/ui/src/main.ts`
2. Users will be notified when new versions are available

## Changelog

### 2026-01-04 - Initial Fork Setup

- Forked from AutoMaker-Org/automaker at commit `f34fd95`
- Added sync infrastructure (`scripts/sync-upstream.sh`)
- Added fork documentation (`FORK.md`)
- Added upstream notification workflow
- Updated `CLAUDE.md` with fork strategy
- Configured release infrastructure for fork:
  - Updated `apps/ui/package.json` with fork repository
  - Added `electron-updater` for future auto-update support
  - Configured GitHub releases publish settings
  - Changed appId to `com.automaker.fork.app` to avoid conflicts
