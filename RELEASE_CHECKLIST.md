# Release Checklist

This is the definitive pre-release verification checklist for VibeCode. Every release — alpha, beta, or stable — must pass all applicable checks before being published.

---

## Pre-Release Verification

### 1. Code Quality

- [ ] All CI checks pass on `main`: `npm run ci`
- [ ] Zero TypeScript errors: `npm run typecheck`
- [ ] Zero lint errors: `npm run lint`
- [ ] All tests pass: `npm run test` (82+ tests)
- [ ] Build succeeds: `npm run build`
- [ ] No secrets in staging: `npm run check:all`

### 2. Security

- [ ] `npm audit` reports no critical or high vulnerabilities
- [ ] gitleaks scan passes with no findings
- [ ] No API keys, tokens, or credentials in the codebase or build output
- [ ] Security-sensitive files reviewed: `path-sandbox.ts`, `execution-engine.ts`, `provider-manager.ts`
- [ ] `.env` files are not staged for commit

### 3. Documentation

- [ ] CHANGELOG.md updated with all changes for this version
- [ ] Version header added with correct date
- [ ] `[Unreleased]` section cleaned and moved to versioned section
- [ ] README.md reflects current features and status
- [ ] All documentation cross-references are valid (no broken links)
- [ ] New features have corresponding documentation
- [ ] Breaking changes documented with migration instructions

### 4. Version

- [ ] Version number follows semantic versioning (see [VERSIONING_POLICY.md](VERSIONING_POLICY.md))
- [ ] `package.json` version field matches intended release version
- [ ] Pre-release identifier correct (`-alpha.N`, `-beta.N`, `-rc.N`) if applicable
- [ ] Version bump commit created: `chore: bump version to v{VERSION}`

### 5. Build Artifacts

- [ ] macOS build succeeds: `npm run dist:mac`
- [ ] Windows build succeeds: `npm run dist:win`
- [ ] Linux build succeeds: `npm run dist:linux`
- [ ] All expected artifacts present in `dist-electron/`
- [ ] Application launches and runs on each target platform
- [ ] Auto-update manifest (`latest.yml`) generated correctly

---

## Release Process

### 6. Tag and Push

- [ ] Annotated tag created: `git tag -s v{VERSION} -m "Release v{VERSION}"`
- [ ] Tag pushed to origin: `git push origin main --tags`

### 7. GitHub Release

- [ ] GitHub Release created from tag
- [ ] Release title: `v{VERSION}`
- [ ] Release description contains changelog for this version
- [ ] Pre-release flag set correctly (checked for alpha/beta, unchecked for stable)
- [ ] All platform artifacts uploaded

### 8. Verification

- [ ] Install from release artifact on macOS
- [ ] Install from release artifact on Windows
- [ ] Install from release artifact on Linux
- [ ] Auto-update detection works from previous version
- [ ] `npm run status` reports correct version
- [ ] All core features functional in installed build

---

## Post-Release

### 9. Communication

- [ ] Announce release on relevant channels
- [ ] Close GitHub issues resolved by this release
- [ ] Update documentation if needed

### 10. Next Cycle

- [ ] Create new `[Unreleased]` section in CHANGELOG.md
- [ ] Begin next development cycle
- [ ] Update project board or roadmap if applicable

---

## Hotfix Checklist

For critical bugs requiring immediate release:

1. [ ] Create branch from release tag: `git checkout -b hotfix/v{VERSION} v{VERSION}`
2. [ ] Apply minimal fix with regression test
3. [ ] Run full CI: `npm run ci`
4. [ ] Bump patch version
5. [ ] Follow standard release process (steps 6-10)
6. [ ] Merge hotfix back to `main`

---

## Alpha-Specific Notes

Alpha releases have relaxed requirements:

- Code signing is recommended but not required
- Not all platform builds are mandatory (macOS is primary)
- Manual smoke test may be limited to the primary development platform
- Auto-update verification may be deferred

However, all CI, security, and documentation checks still apply.
