# Immutable Regulatory Sandbox

> **A trust-minimized, cryptographically provable data science environment for regulatory compliance.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## The Problem

In regulated industries—pharmaceuticals, finance, clinical research, government audits—the question isn't just *"Did you get the right answer?"* but *"Can you prove how you got it?"*

Traditional data science workflows fail this test:

- **Mutable environments**: Dependencies change. Python packages update. The same code produces different results six months later.
- **No chain of custody**: There's no proof that the input data wasn't modified mid-analysis.
- **Trust-based verification**: Regulators must *trust* that the analyst didn't manipulate outputs. There's no cryptographic proof.
- **Scattered provenance**: Metadata about the experiment is spread across notebooks, emails, and memory.

**Result**: Expensive, manual audit processes. Reproducibility crises. Regulatory delays.

---

## The Solution: The Box

The **Immutable Regulatory Sandbox** is a VS Code extension that enforces a **sealed, auditable environment** for data science experiments.

### Core Philosophy

1. **Immutability by Design**  
   Input data is mounted as **read-only**. You cannot accidentally (or intentionally) modify your source data once the experiment begins.

2. **Cryptographic Provenance**  
   Every finalizedeexperiment generates a **manifest** containing:
   - SHA-256 hashes of all input files
   - SHA-256 hashes of all output files
   - A snapshot of the code used
   - Environment state (`pip freeze`)
   - A **GPG signature** from the analyst
   - An **RFC 3161 timestamp** from a public Timestamping Authority (FreeTSA)

3. **One Experiment, One Directory**  
   Each sandbox is a self-contained, isolated unit. You cannot create overlapping experiments in the same directory. This enforces traceability.

4. **Lifecycle State Machine**  
   Experiments transition through defined states:
   - `CREATED`: Freshly initialized.
   - `IN_PROGRESS`: Actively being worked on.
   - `COMPLETED`: Finalized and **locked**. Cannot be reopened.

5. **Git-Native Traceability**  
   Every sandbox is automatically initialized as a Git repository. The initial state is committed, providing a permanent baseline for change tracking.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. CREATE SANDBOX                                          │
│     • Select empty directory                                │
│     • Select source data folder (→ copied to input/)        │
│     • Dev Container + Git initialized                       │
│     • Status: CREATED                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. WORK INSIDE THE BOX                                     │
│     • Open in Dev Container (VS Code Remote)                │
│     • input/ is READ-ONLY                                   │
│     • Write results to output/                              │
│     • Status: IN_PROGRESS                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. FINALIZE EXPERIMENT                                     │
│     • Hash all input files (SHA-256)                        │
│     • Hash all output files (SHA-256)                       │
│     • Snapshot code                                         │
│     • Capture pip freeze                                    │
│     • Sign manifest with GPG                                │
│     • Timestamp with FreeTSA (RFC 3161)                     │
│     • Status: COMPLETED (LOCKED)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## The Verification Receipt

When you finalize an experiment, you generate a `manifest.json` that looks like this:

```json
{
  "timestamp": "2026-02-01T00:30:00.000Z",
  "input_hashes": {
    "raw_data.csv": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "config.yaml": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
  },
  "output_hashes": {
    "model.pkl": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    "report.pdf": "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
  },
  "pip_freeze": "numpy==1.26.0\npandas==2.1.0\nscikit-learn==1.3.0\n...",
  "system_info": "sha256:abc123..."
}
```

Alongside this, you get:
- `manifest.json.asc` — GPG detached signature
- `manifest.tsr` — RFC 3161 timestamp response

**This is your proof.** Hand it to the regulator. They can verify:
1. The input data matches the declared hashes.
2. The output was produced from that input.
3. The analyst signed it with their key.
4. It existed at a specific point in time (timestamp authority).

---

## Installation

### Prerequisites
- VS Code
- Docker (for Dev Containers)
- OpenSSL (for timestamping)
- GPG (for signing)
- Git

### Install the Extension

```bash
# Clone the repo
git clone git@github.com:davidwarshawsky/data-science-sandbox.git
cd data-science-sandbox

# Install dependencies
npm install

# Compile
npm run compile

# Package
npx @vscode/vsce package

# Install locally
code --install-extension immutable-regulatory-sandbox-0.0.1.vsix
```

---

## Usage

1. **Open VS Code** and look for the "Immutable Sandbox" icon in the Activity Bar.
2. **Create a Sandbox**: Click "New Experiment". Select a clean directory and your source data.
3. **Work in the Box**: VS Code will prompt you to "Reopen in Container". Your `input/` folder is now read-only.
4. **Finalize**: When done, run the command `Immutable: Finalize Experiment` (inside the container).
5. **Archive**: The `manifest.json`, signature, and timestamp are your audit artifacts.

---

## Why This Matters

| Traditional Workflow | Immutable Sandbox |
|----------------------|-------------------|
| Mutable input data | Read-only mounts |
| No hash verification | SHA-256 on all files |
| "Trust me" | GPG signature |
| "It was done last week" | RFC 3161 timestamp |
| Scattered metadata | Single `manifest.json` |
| Manual audit | Automated provenance |

---

## Target Users

- **Pharmaceutical companies** validating clinical trial analysis
- **Financial institutions** auditing risk models
- **Government agencies** requiring reproducible statistics
- **Research labs** publishing pre-registered studies
- **Any team** that needs to answer: *"Can you prove this result wasn't tampered with?"*

---

## Roadmap

- [ ] Remote attestation (hardware-backed trust)
- [ ] Blockchain anchoring of manifests
- [ ] Multi-user signing (co-analyst signatures)
- [ ] Integration with regulatory submission portals

---

## License

MIT — See [LICENSE](LICENSE)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)
