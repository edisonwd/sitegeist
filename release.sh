#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BUMP_TYPE="$1"
DRY_RUN=false

# Parse arguments
if [ "$BUMP_TYPE" = "--dry-run" ] || [ "$BUMP_TYPE" = "-n" ]; then
    DRY_RUN=true
    BUMP_TYPE="$2"
elif [ "$2" = "--dry-run" ] || [ "$2" = "-n" ]; then
    DRY_RUN=true
fi

# Validate bump type
if [ "$BUMP_TYPE" != "major" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "patch" ]; then
    echo -e "${RED}Error: Invalid version bump type${NC}"
    echo "Usage: ./release.sh <major|minor|patch> [--dry-run|-n]"
    echo ""
    echo "Examples:"
    echo "  ./release.sh patch          # 1.0.0 -> 1.0.1"
    echo "  ./release.sh minor          # 1.0.0 -> 1.1.0"
    echo "  ./release.sh major          # 1.0.0 -> 2.0.0"
    echo "  ./release.sh patch --dry-run # Preview changes without committing"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: Uncommitted changes detected${NC}"
    echo "Please commit or stash your changes first:"
    git status --short
    exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}Error: Must be on 'main' branch (currently on '$CURRENT_BRANCH')${NC}"
    exit 1
fi

# Read current version from manifest
MANIFEST="static/manifest.chrome.json"
if [ ! -f "$MANIFEST" ]; then
    echo -e "${RED}Error: Manifest file not found at $MANIFEST${NC}"
    exit 1
fi

CURRENT=$(node -p "require('./$MANIFEST').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

# Calculate new version
case "$BUMP_TYPE" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TAG="v$NEW_VERSION"
DATE=$(date +%Y-%m-%d)

# Check if tag already exists
if git tag -l | grep -q "^$TAG$"; then
    echo -e "${RED}Error: Tag '$TAG' already exists${NC}"
    echo "Choose a different version bump type or delete the existing tag first"
    exit 1
fi

# Show what will happen
echo -e "${BLUE}Release Summary${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Version bump: ${GREEN}$CURRENT → $NEW_VERSION${NC} ($BUMP_TYPE)"
echo -e "Tag: ${GREEN}$TAG${NC}"
echo -e "Date: ${GREEN}$DATE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN] Would perform the following:${NC}"
    echo "  1. Update $MANIFEST to version $NEW_VERSION"
    echo "  2. Update CHANGELOG.md: [Unreleased] → [$NEW_VERSION]"
    echo "  3. Run checks (./check.sh)"
    echo "  4. Commit changes"
    echo "  5. Create tag $TAG"
    echo "  6. Push to origin/main and origin/$TAG"
    echo "  7. Trigger GitHub Actions release workflow"
    exit 0
fi

echo -e "${YELLOW}Bumping version: $CURRENT → $NEW_VERSION${NC}"

# Update manifest
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
manifest.version = '$NEW_VERSION';
fs.writeFileSync('$MANIFEST', JSON.stringify(manifest, null, '\t') + '\n');
"
echo -e "${GREEN}✓${NC} Updated $MANIFEST"

# Update CHANGELOG: replace [Unreleased] with version, add new [Unreleased]
node -e "
const fs = require('fs');
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
changelog = changelog.replace('## [Unreleased]', '## [Unreleased]\n\n## [$NEW_VERSION] - $DATE');
fs.writeFileSync('CHANGELOG.md', changelog);
"
echo -e "${GREEN}✓${NC} Updated CHANGELOG.md"

# Run checks
echo -e "${BLUE}Running checks...${NC}"
if ! ./check.sh; then
    echo -e "${RED}Error: Checks failed${NC}"
    echo "Fix the issues before releasing"
    exit 1
fi
echo -e "${GREEN}✓${NC} All checks passed"

# Confirm before pushing
echo ""
echo -e "${YELLOW}Ready to commit and push:${NC}"
echo "  Commit: 'Release v$NEW_VERSION'"
echo "  Tag: $TAG"
echo "  Push to: origin/main and origin/$TAG"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Release cancelled${NC}"
    exit 0
fi

# Commit, tag, push
git add "$MANIFEST" CHANGELOG.md
git commit -m "Release v$NEW_VERSION"
echo -e "${GREEN}✓${NC} Committed"

git tag "$TAG"
echo -e "${GREEN}✓${NC} Tagged"

git push origin main
echo -e "${GREEN}✓${NC} Pushed to main"

git push origin "$TAG"
echo -e "${GREEN}✓${NC} Pushed tag"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Released v$NEW_VERSION${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "GitHub Actions will build and create the release at:"
echo -e "${BLUE}https://github.com/edisonwd/sitegeist/releases/tag/$TAG${NC}"
echo ""
echo "Monitor the build: https://github.com/edisonwd/sitegeist/actions"
