# Contributing to Immutable Regulatory Sandbox

Thank you for your interest in contributing to this project. This tool addresses a critical gap in regulated data science workflows, and your contributions help make it better.

---

## Philosophy

This project is built on a few core principles. Please keep these in mind when contributing:

1. **Security First**  
   Every feature must be evaluated for its impact on the integrity guarantees. If a change weakens the cryptographic chain or allows mutation of input data, it will not be accepted.

2. **Simplicity Over Features**  
   Regulators and auditors need to understand the system. Prefer simple, auditable code over clever abstractions. The manifest format, for example, is intentionally plain JSON.

3. **Trust Minimization**  
   The goal is to remove the need for trust wherever possible. If something can be verified cryptographically, it should be. If something requires trust, document it explicitly.

4. **Reproducibility**  
   Changes should not break the ability to reproduce experiment environments. Pay close attention to dependency management and containerization.

---

## Getting Started

### Prerequisites

- Node.js 18+
- VS Code (for testing the extension)
- Docker (for Dev Container testing)
- GPG (for signing tests)
- OpenSSL (for timestamp tests)

### Setup

```bash
git clone git@github.com:davidwarshawsky/data-science-sandbox.git
cd data-science-sandbox
npm install
npm run compile
```

### Running Locally

1. Open the project in VS Code.
2. Press `F5` to launch the Extension Development Host.
3. In the new VS Code window, test the extension.

---

## Code Style

- **TypeScript**: All source code is in `src/`.
- **Strict Mode**: TypeScript strict mode is enabled. Fix all type errors.
- **Formatting**: Use Prettier defaults. Run `npx prettier --write .` before committing.
- **No Magic**: Avoid implicit behavior. If a function has side effects, name it clearly (e.g., `updateDatabaseStatus`).

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add RFC 3161 timestamping support
fix: Correct hash calculation for empty directories
docs: Update README with installation instructions
refactor: Extract manifest generation to separate module
```

---

## Pull Request Process

1. **Fork** the repository and create a feature branch.
2. **Write tests** if applicable (especially for provenance logic).
3. **Update documentation** if your change affects user-facing behavior.
4. **Open a PR** against `master` with a clear description of:
   - What the change does
   - Why it's needed
   - How it was tested
5. A maintainer will review and provide feedback.

---

## Security Considerations

If your contribution touches any of the following, please be extra careful and document your reasoning:

- **Hashing logic** (`hashDirectory`, `calculateFileHash`)
- **Signing logic** (GPG integration)
- **Timestamping logic** (RFC 3161 / FreeTSA)
- **Read-only enforcement** (Dev Container mounts)
- **Database schema** (state transitions, status checks)

If you discover a security vulnerability, **do not open a public issue**. Email the maintainer directly.

---

## What We Need Help With

- [ ] **Unit tests** for `src/db.ts` and `src/extension.ts`
- [ ] **E2E tests** for the full Create → Work → Finalize flow
- [ ] **Documentation** for enterprise deployment (air-gapped environments)
- [ ] **Platform support** for Windows/macOS (currently tested on Linux)
- [ ] **Accessibility** improvements in the Dashboard UI

---

## Code of Conduct

Be respectful. Be constructive. We're building tools to help people do trustworthy work—let's model that ourselves.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
