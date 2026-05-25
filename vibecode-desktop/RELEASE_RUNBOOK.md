# VibeCode Desktop — Release Runbook

## Pre-Release Checklist

### 1. Verification Gate
- [ ] All tests pass: `npm test` (250+ tests)
- [ ] System tests pass: `npm run test:system`
- [ ] Type check passes: `npm run typecheck`
- [ ] Lint passes: `npm run lint`
- [ ] Import wall verified: no src/system/ → src/main/ violations
- [ ] Brand audit clean: `npx ts-node scripts/audit-brand.ts`
- [ ] Dependency audit clean: `npx ts-node scripts/audit-deps.ts`
- [ ] Release readiness score ≥ 90: `npx ts-node scripts/check-release-readiness.ts`

### 2. Version Bump
- [ ] Update `version` in `package.json`
- [ ] Update `APP_VERSION` in `src/main/services/branding.ts`
- [ ] Update version references in `electron-builder.yml` if needed
- [ ] Update `CHANGELOG.md` with new version entry
- [ ] Commit version bump: `git commit -m "chore: bump version to X.Y.Z"`

### 3. Build & Package
- [ ] Clean build: `npm run build`
- [ ] macOS build: `npx electron-builder --mac`
  - [ ] Verify hardenedRuntime enabled
  - [ ] Verify entitlements applied
  - [ ] Verify code signature (if certificates available)
  - [ ] Test DMG installer on macOS
- [ ] Windows build: `npx electron-builder --win`
  - [ ] Verify NSIS installer created
  - [ ] Verify code signature (if certificates available)
  - [ ] Test installer on Windows
- [ ] Linux build: `npx electron-builder --linux`
  - [ ] Verify AppImage, .deb, and .rpm created
  - [ ] Test AppImage on Ubuntu
  - [ ] Test .deb package

### 4. Tag & Release
- [ ] Create git tag: `git tag v0.X.0`
- [ ] Push tag: `git push origin v0.X.0`
- [ ] GitHub Actions will automatically build and create a release
- [ ] Verify release artifacts on GitHub Releases page

### 5. Post-Release
- [ ] Smoke tests pass on all platforms
- [ ] Auto-update channel verified
- [ ] Download and test from release page
- [ ] Announce release

## Emergency Procedures

### Hotfix Release
1. Create hotfix branch from tag: `git checkout -b hotfix/v0.X.1 v0.X.0`
2. Apply fix
3. Run full test suite
4. Bump patch version
5. Tag and push: `git tag v0.X.1 && git push origin v0.X.1`

### Rollback
1. Delete the GitHub release
2. Mark the release as pre-release or draft
3. Notify users via auto-update channel
4. Fix and re-release

### Build Failure
1. Check CI logs for the failing step
2. Fix the issue on a branch
3. Re-trigger the workflow
4. If the tag was already pushed, create a new patch tag
