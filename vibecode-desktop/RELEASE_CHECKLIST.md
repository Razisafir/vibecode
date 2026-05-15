# VibeCode Desktop — Release Checklist

## Pre-Release

- [ ] All tests passing (`npm test`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Build succeeds on all platforms (`npm run build`)
- [ ] CHANGELOG.md updated with release notes
- [ ] Version bumped in package.json
- [ ] Git tag created (`vX.Y.Z`)
- [ ] No security vulnerabilities in dependencies
- [ ] API key storage uses encryption
- [ ] Content Security Policy is strict in production
- [ ] All new IPC channels have validation
- [ ] Rate limiting active on all channels
- [ ] Audit logging functional

## Build

- [ ] macOS DMG builds successfully
- [ ] Windows NSIS installer builds successfully
- [ ] Windows portable builds successfully
- [ ] Linux AppImage builds successfully
- [ ] Linux deb package builds successfully
- [ ] Source maps excluded from production build
- [ ] Build size is reasonable (<300MB)
- [ ] Release metadata generated

## Code Signing

- [ ] macOS: App signed with Developer ID
- [ ] macOS: App notarized by Apple
- [ ] Windows: App signed with code signing certificate
- [ ] Signatures verified on all platforms

## Auto-Update

- [ ] Update manifest generated correctly
- [ ] Update check works from previous version
- [ ] Download and install flow works
- [ ] Rollback works if update fails
- [ ] Channel switching works (stable/beta/nightly)

## E2E Testing

- [ ] App launch test passes
- [ ] Provider configuration test passes
- [ ] Workspace operations test passes
- [ ] Execution engine test passes
- [ ] Proposal system test passes
- [ ] Rollback test passes
- [ ] Session restore test passes
- [ ] File operations test passes
- [ ] Auto-update test passes
- [ ] Settings persistence test passes

## Distribution

- [ ] GitHub Release draft created
- [ ] All artifacts uploaded to release
- [ ] Release notes published
- [ ] Update server manifests updated
- [ ] Website download links updated
- [ ] Documentation updated for new version

## Post-Release

- [ ] Monitor crash reports
- [ ] Monitor update adoption rate
- [ ] Monitor support channels (Discord, GitHub Issues)
- [ ] Hotfix process ready if critical bugs found
- [ ] Collect user feedback
- [ ] Plan next release
