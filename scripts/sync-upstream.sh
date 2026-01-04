#!/bin/bash
#
# sync-upstream.sh - History-preserving upstream sync for Automaker fork
#
# This script syncs your fork with upstream without requiring force-push.
# It uses the "merge bridge" technique to preserve history while keeping
# your patches cleanly on top.
#
# Usage:
#   ./scripts/sync-upstream.sh [--dry-run] [--check-only]
#
# Options:
#   --dry-run      Show what would happen without making changes
#   --check-only   Only check if upstream has new commits, don't sync
#
# Prerequisites:
#   - Clean working tree (no uncommitted changes)
#   - 'fork-base' tag must exist (created on first run)
#   - 'upstream' remote must point to AutoMaker-Org/automaker
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"
FORK_BASE_TAG="fork-base"
MAIN_BRANCH="main"

# Parse arguments
DRY_RUN=false
CHECK_ONLY=false
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Automaker Fork Sync Tool${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check for clean working tree
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}ERROR: Working tree is not clean.${NC}"
    echo "Please commit or stash your changes before syncing."
    exit 1
fi
echo -e "${GREEN}✓ Working tree is clean${NC}"

# Check upstream remote exists
if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
    echo -e "${RED}ERROR: Upstream remote '$UPSTREAM_REMOTE' not found.${NC}"
    echo "Add it with: git remote add upstream https://github.com/AutoMaker-Org/automaker.git"
    exit 1
fi
echo -e "${GREEN}✓ Upstream remote configured${NC}"

# Fetch upstream
echo ""
echo -e "${YELLOW}Fetching upstream changes...${NC}"
git fetch "$UPSTREAM_REMOTE"
echo -e "${GREEN}✓ Fetched upstream${NC}"

# Check if fork-base tag exists, create if first run
if ! git rev-parse "$FORK_BASE_TAG" &>/dev/null; then
    echo ""
    echo -e "${YELLOW}First run detected. Creating fork-base tag at current HEAD...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY-RUN] Would create tag: $FORK_BASE_TAG at $(git rev-parse --short HEAD)${NC}"
    else
        git tag "$FORK_BASE_TAG"
        echo -e "${GREEN}✓ Created $FORK_BASE_TAG tag${NC}"
    fi
fi

# Calculate divergence
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMITS_AHEAD=$(git rev-list --count "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH..HEAD")
COMMITS_BEHIND=$(git rev-list --count "HEAD..$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")
FORK_COMMITS=$(git rev-list --count "$FORK_BASE_TAG..HEAD")

echo ""
echo -e "${BLUE}Fork Status:${NC}"
echo "  Current branch: $CURRENT_BRANCH"
echo "  Commits ahead of upstream: $COMMITS_AHEAD"
echo "  Commits behind upstream: $COMMITS_BEHIND"
echo "  Fork-specific commits: $FORK_COMMITS"

if [ "$COMMITS_BEHIND" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Fork is up to date with upstream!${NC}"
    exit 0
fi

if [ "$CHECK_ONLY" = true ]; then
    echo ""
    echo -e "${YELLOW}Upstream has $COMMITS_BEHIND new commits.${NC}"
    echo "Run without --check-only to sync."
    exit 0
fi

echo ""
echo -e "${YELLOW}Upstream has $COMMITS_BEHIND new commits. Starting sync...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo -e "${BLUE}[DRY-RUN] Would perform the following steps:${NC}"
    echo "  1. Checkout upstream/$UPSTREAM_BRANCH"
    echo "  2. Create merge bridge: git merge -s ours $MAIN_BRANCH"
    echo "  3. Tag as 'next-base'"
    echo "  4. Checkout $MAIN_BRANCH"
    echo "  5. Rebase fork commits: git rebase --onto next-base $FORK_BASE_TAG $MAIN_BRANCH"
    echo "  6. Update fork-base tag"
    echo ""
    echo -e "${YELLOW}No changes made (dry-run mode)${NC}"
    exit 0
fi

# Store current branch to return to
ORIGINAL_BRANCH="$CURRENT_BRANCH"

# Step 1: Checkout upstream branch
echo ""
echo -e "${YELLOW}Step 1: Checking out upstream/$UPSTREAM_BRANCH...${NC}"
git checkout "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"

# Step 2: Create merge bridge
echo -e "${YELLOW}Step 2: Creating merge bridge...${NC}"
git merge -s ours "$MAIN_BRANCH" -m "Merge bridge for upstream sync $(date +%Y-%m-%d)"

# Step 3: Tag the bridge point
echo -e "${YELLOW}Step 3: Tagging bridge point...${NC}"
git tag -f next-base

# Step 4: Return to main branch
echo -e "${YELLOW}Step 4: Returning to $MAIN_BRANCH...${NC}"
git checkout "$MAIN_BRANCH"

# Step 5: Rebase fork commits onto bridge
echo -e "${YELLOW}Step 5: Rebasing fork commits...${NC}"
if [ "$FORK_COMMITS" -gt 0 ]; then
    if git rebase --onto next-base "$FORK_BASE_TAG" "$MAIN_BRANCH"; then
        echo -e "${GREEN}✓ Rebased $FORK_COMMITS fork commits${NC}"
    else
        echo ""
        echo -e "${RED}Rebase conflicts detected!${NC}"
        echo ""
        echo "To resolve:"
        echo "  1. Fix the conflicts in the marked files"
        echo "  2. git add <fixed-files>"
        echo "  3. git rebase --continue"
        echo ""
        echo "To abort and return to previous state:"
        echo "  git rebase --abort"
        echo ""
        echo "After resolving, update the fork-base tag:"
        echo "  git tag -f $FORK_BASE_TAG next-base"
        echo "  git tag -d next-base"
        exit 1
    fi
else
    echo -e "${GREEN}✓ No fork-specific commits to rebase${NC}"
    # Fast-forward to upstream
    git reset --hard next-base
fi

# Step 6: Update tags
echo -e "${YELLOW}Step 6: Updating tags...${NC}"
git tag -f "$FORK_BASE_TAG" next-base
git tag -d next-base 2>/dev/null || true

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Sync complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git log --oneline -20"
echo "  2. Run tests: npm run test:all"
echo "  3. Push to origin: git push origin $MAIN_BRANCH"
echo ""
echo -e "${YELLOW}Note: Regular push should work (no force-push needed).${NC}"
echo -e "${YELLOW}If push is rejected, check if someone else pushed to origin.${NC}"
