# Contributing to VibeCode Desktop

Thank you for your interest in contributing to VibeCode! This document provides guidelines for contributing.

## Code of Conduct

Be respectful, constructive, and professional. We are committed to providing a welcoming and inclusive experience for everyone.

## How to Contribute

### Bug Reports

1. Search existing issues to avoid duplicates
2. Open a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs. actual behavior
   - System information (OS, VibeCode version)
   - Screenshots or logs if applicable

### Feature Requests

1. Check existing issues and discussions
2. Open a feature request with:
   - Use case and problem statement
   - Proposed solution
   - Alternative approaches considered
   - Willingness to implement

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit with descriptive messages
7. Push and open a pull request

### Contributor License Agreement (CLA)

By contributing to VibeCode, you agree that your contributions will be licensed under the same license as the project. A CLA may be required for significant contributions.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/Razisafir/vibecode.git
cd vibecode/vibecode-desktop

# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Build
npm run build
```

## Code Style

- TypeScript: Strict mode, no `any` types where possible
- React: Functional components with hooks
- CSS: Tailwind utility classes, custom CSS only when necessary
- Naming: camelCase for variables/functions, PascalCase for components/types

## Architecture

- `src/main/` — Electron main process
- `src/preload/` — Context bridge (preload script)
- `src/renderer/` — React UI components
- `src/__tests__/` — Unit and integration tests
- `e2e/` — End-to-end tests

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, semicolons)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Build process, dependencies, tooling

## Testing

- Write tests for all new functionality
- Maintain or improve code coverage
- Integration tests should use the existing mock infrastructure
- E2E tests go in the `e2e/` directory

## Security

- Never commit API keys, secrets, or credentials
- Report security vulnerabilities to security@vibecode.dev
- Follow the security disclosure policy in `legal/SECURITY_POLICY.md`

## Questions?

Open a GitHub Discussion or reach out to the team at hello@vibecode.dev.
