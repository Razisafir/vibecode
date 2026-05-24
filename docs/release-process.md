# Release Process

This document describes the release process for VibeCode. For the step-by-step pre-release verification checklist, see [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md). For versioning rules and breaking change definitions, see [VERSIONING_POLICY.md](../VERSIONING_POLICY.md).

---

## Prerequisites

- Commit access to the main branch
- Code signing certificates available
- All CI checks passing on main

## Release Checklist

### 1. Pre-Release Verification

- [ ] All CI checks pass on main branch
- [ ] No open security vulnerabilities (npm audit, CodeQL)
- [ ] CHANGELOG.md updated with all changes for this version
- [ ] Version number decided (follow semver)
- [ ] All feature PRs for this version are merged
- [ ] Manual smoke test completed on all platforms

### 2. Version Bump

```bash
cd vibecode-desktop
# Determine version: MAJOR.MINOR.PATCH
# - MAJOR: Breaking changes requiring user action
# - MINOR: New features (backward compatible)
# - PATCH: Bug fixes (backward compatible)
# - Prerelease: -alpha.N or -beta.N

npm version [patch|minor|major] --no-git-tag-version
# Or manually edit package.json version field

cd ..
git add vibecode-desktop/package.json
git commit -m "chore: bump version to v{VERSION}"
```

### 3. Update Changelog

```bash
# Add the version header to CHANGELOG.md
# Move items from [Unreleased] to [VERSION] section
# Date format: YYYY-MM-DD
```

### 4. Create Release Tag

```bash
git tag -s v{VERSION} -m "Release v{VERSION}"
git push origin main --tags
```

### 5. Create GitHub Release

1. Go to GitHub > Releases > Draft a new release
2. Select the tag v{VERSION}
3. Title: `v{VERSION}`
4. Copy the changelog section for this version into the description
5. Mark as pre-release if alpha/beta
6. Do NOT publish yet — wait for CI to build artifacts

### 6. Build and Sign

```bash
# macOS (requires Apple Developer certificate)
npm run dist:mac

# Windows (requires code signing certificate)
npm run dist:win

# Linux (no signing required)
npm run dist:linux
```

### 7. Upload Artifacts

Upload built artifacts to the GitHub Release:
- `VibeCode-{version}-mac.dmg`
- `VibeCode-{version}-mac.zip`
- `VibeCode-Setup-{version}.exe`
- `VibeCode-{version}-portable.exe`
- `VibeCode-{version}.AppImage`
- `vibecode_{version}_amd64.deb`
- `latest.yml` (auto-update manifest)

### 8. Publish Release

1. Verify all artifacts are uploaded
2. Verify the release description is accurate
3. Uncheck "Set as pre-release" if this is a stable release
4. Click "Publish release"

### 9. Verify Auto-Update

1. Install the previous version of VibeCode
2. Wait for auto-update check (or trigger manually)
3. Verify the update is detected and offered
4. Install the update and verify the new version runs correctly

### 10. Post-Release

- [ ] Announce the release on relevant channels
- [ ] Close issues resolved by this release
- [ ] Update documentation if needed
- [ ] Begin next development cycle

## Hotfix Process

For critical bugs requiring immediate release:

1. Create a branch from the release tag: `git checkout -b hotfix/v{VERSION} v{VERSION}`
2. Apply the minimal fix
3. Run full CI
4. Bump patch version
5. Follow the standard release process (steps 3-10)
6. Merge the hotfix back to main

## Alpha Channel

Alpha releases follow the same process but:
- Version format: `0.x.0-alpha.N`
- GitHub Release marked as pre-release
- Only served to users on the alpha update channel
- No code signing requirement (but recommended)
