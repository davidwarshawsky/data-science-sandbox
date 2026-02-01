import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as cp from 'child_process';
import * as util from 'util';

import { DatabaseManager } from './db';
import { DashboardProvider } from './dashboard';
import { WelcomePanel } from './welcome';

const exec = util.promisify(cp.exec);

export async function activate(context: vscode.ExtensionContext) {
    console.log('Immutable Regulatory Sandbox is active!');

    // Show Welcome Page on first run
    const hasSeenWelcome = context.globalState.get<boolean>('hasSeenWelcome');
    if (!hasSeenWelcome) {
        WelcomePanel.createOrShow(context.extensionUri);
        context.globalState.update('hasSeenWelcome', true);
    }

    const db = new DatabaseManager();
    try {
        await db.init();
    } catch (err) {
        console.error('Failed to init DB', err);
        vscode.window.showErrorMessage('Failed to initialize Experiment Registry.');
    }

    // Register Dashboard Provider
    const provider = new DashboardProvider(context.extensionUri, db);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, provider)
    );

    let createSandboxDisposable = vscode.commands.registerCommand('immutable.createSandbox', async () => {
        // 1. Ask user for sandbox location
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Sandbox Location'
        });

        if (!folderUri || folderUri.length === 0) {
            return;
        }

        const projectPath = folderUri[0].fsPath;
        const projectName = path.basename(projectPath);

        // 1b. Safety Checks:
        // A. File system check (is this already an experiment?)
        if (fs.existsSync(path.join(projectPath, 'output')) || fs.existsSync(path.join(projectPath, '.devcontainer'))) {
            vscode.window.showErrorMessage(`Error: The folder '${projectName}' looks like an existing project (has 'output' or '.devcontainer'). Please select a clean folder.`);
            return;
        }

        // B. Database Check (is this registered?)
        const existingExp = await db.getExperimentByPath(projectPath);
        if (existingExp) {
            vscode.window.showErrorMessage(`Error: The folder '${projectName}' is already registered as an experiment in the database.`);
            return;
        }

        // 2. Ask user for Input Source Data
        const inputSourceUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Source Data Folder',
            title: 'Select the folder containing your initial data (will be copied to input/)'
        });

        if (!inputSourceUri || inputSourceUri.length === 0) {
            vscode.window.showWarningMessage("Sandbox creation cancelled: Input Source is required.");
            return;
        }
        const inputSourcePath = inputSourceUri[0].fsPath;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Creating Immutable Sandbox...",
                cancellable: false
            }, async (progress) => {
                progress.report({ message: "Scaffolding structure..." });
                // 3. Scaffold Directory Structure & Copy Input
                await scaffoldProject(projectPath, inputSourcePath);

                // 4. Git Initialization
                progress.report({ message: "Initializing Git Repository..." });
                try {
                    await exec('git init', { cwd: projectPath });
                    await exec('git add .', { cwd: projectPath });
                    await exec('git commit -m "Initial Sandbox Creation"', { cwd: projectPath });
                } catch (gitErr) {
                    console.error("Git init failed", gitErr);
                    // Non-fatal, but warn
                    vscode.window.showWarningMessage("Git initialization failed. Is git installed?");
                }

                // 5. Register in DB
                progress.report({ message: "Registering experiment..." });
                const id = crypto.randomUUID();
                await db.insertExperiment(id, projectName, projectPath);
                provider.refresh(); // Update UI
            });

            vscode.window.showInformationMessage(`Immutable Sandbox created at ${projectPath}`);

            // Option to open the folder
            const selection = await vscode.window.showInformationMessage('Open Sandbox?', 'Yes', 'No');
            if (selection === 'Yes') {
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath));
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create sandbox: ${error.message}`);
        }
    });

    let finalizeDisposable = vscode.commands.registerCommand('immutable.finalizeExperiment', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace open.');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Finalizing Experiment...",
            cancellable: false
        }, async (progress) => {
            try {
                // 1. Calculate Hashes
                progress.report({ message: "Hashing Input..." });
                const inputHashes = await hashDirectory(path.join(rootPath, 'input'));

                progress.report({ message: "Hashing Output..." });
                const outputHashes = await hashDirectory(path.join(rootPath, 'output'));

                // 1b. Capture Environment (Pip Freeze)
                progress.report({ message: "Capturing Environment..." });
                let pipFreeze = "";
                try {
                    const { stdout } = await exec('pip freeze', { cwd: rootPath });
                    pipFreeze = stdout;
                } catch (e: any) {
                    pipFreeze = "Error capturing pip freeze: " + e.message;
                }

                // 2. Snapshot Code
                progress.report({ message: "Snapshotting Code..." });
                const codeSnapshotDir = path.join(rootPath, '.provenance', 'code_snapshot');
                await fs.ensureDir(codeSnapshotDir);
                // Copy .py, .ipynb, .R files
                const codeFiles = await vscode.workspace.findFiles('**/*.{py,ipynb,R}', '**/node_modules/**');
                for (const file of codeFiles) {
                    const dest = path.join(codeSnapshotDir, path.basename(file.fsPath));
                    await fs.copy(file.fsPath, dest);
                }

                // 3. Generate Manifest
                progress.report({ message: "Generating Manifest..." });
                const manifest = {
                    timestamp: new Date().toISOString(),
                    input_hashes: inputHashes,
                    output_hashes: outputHashes,
                    system_info: "Docker Image ID would be here (requires docker socket access or env var)",
                    pip_freeze: pipFreeze
                };

                const manifestPath = path.join(rootPath, 'manifest.json');
                await fs.writeJson(manifestPath, manifest, { spaces: 2 });

                // 4. Sign Manifest (GPG)
                progress.report({ message: "Signing with GPG..." });
                try {
                    const keyId = await getOrGenerateKey();
                    // Use the specific key
                    await exec(`gpg --default-key "${keyId}" --detach-sign --armor "${manifestPath}"`);
                } catch (gpgError) {
                    throw new Error("GPG Signing failed. " + gpgError);
                }

                // 5. Timestamp (FreeTSA)
                progress.report({ message: "Timestamping..." });
                try {
                    // Create query
                    const tsqPath = path.join(rootPath, 'manifest.tsq');
                    const tsrPath = path.join(rootPath, 'manifest.tsr');
                    await exec(`openssl ts -query -data "${manifestPath}" -sha256 -out "${tsqPath}"`);

                    // Send to FreeTSA
                    await exec(`curl -H "Content-Type: application/timestamp-query" --data-binary @"${tsqPath}" https://freetsa.org/tsr -o "${tsrPath}"`);

                    // Cleanup
                    await fs.remove(tsqPath);
                } catch (tsError) {
                    vscode.window.showWarningMessage("Timestamping failed (network issue?): " + tsError);
                }

                // 6. Update DB
                await db.finalizeExperiment(rootPath, manifestPath);
                provider.refresh();

                vscode.window.showInformationMessage(`Experiment Finalized! Manifest: ${manifestPath}`);

            } catch (error: any) {
                vscode.window.showErrorMessage(`Finalization failed: ${error.message}`);
            }
        });
    });

    let showDashboardDisposable = vscode.commands.registerCommand('immutable.showDashboard', async () => {
        await vscode.commands.executeCommand('immutable.dashboardView.focus');
    });

    let showWelcomeDisposable = vscode.commands.registerCommand('immutable.showWelcome', () => {
        WelcomePanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(createSandboxDisposable);
    context.subscriptions.push(finalizeDisposable);
    context.subscriptions.push(showDashboardDisposable);
    context.subscriptions.push(showWelcomeDisposable);
}

export function deactivate() { }

// --- Helper Functions ---

async function scaffoldProject(rootPath: string, inputSourcePath: string) {
    // Define paths
    const inputDir = path.join(rootPath, 'input');
    const outputDir = path.join(rootPath, 'output');
    const devContainerDir = path.join(rootPath, '.devcontainer');
    const requirementsFile = path.join(rootPath, 'requirements.txt');

    // Create directories
    await fs.ensureDir(inputDir);
    await fs.ensureDir(outputDir);
    await fs.ensureDir(devContainerDir);

    // Copy Input Data
    if (inputSourcePath) {
        await fs.copy(inputSourcePath, inputDir);
    }

    // Create placeholder files
    if (!fs.existsSync(requirementsFile)) {
        await fs.writeFile(requirementsFile, '# Add your dependencies here\npandas\nnumpy\nipykernel\n');
    }

    if (!fs.existsSync(path.join(inputDir, 'README.md'))) {
        await fs.writeFile(path.join(inputDir, 'README.md'), 'Data in this folder is READ-ONLY inside the container.');
    }
    await fs.writeFile(path.join(outputDir, 'README.md'), 'Write your results here. This is the only writeable directory for results.');

    // Create Dev Container Configs
    await createDevContainerConfig(devContainerDir);
}

async function createDevContainerConfig(dir: string) {
    const devcontainerJson = {
        "name": "Immutable Data Science Box",
        "build": {
            "dockerfile": "Dockerfile"
        },
        "customizations": {
            "vscode": {
                "settings": {
                    "python.defaultInterpreterPath": "/workspace/.venv/bin/python"
                },
                "extensions": [
                    "ms-python.python"
                ]
            }
        },
        "mounts": [
            // CRITICAL: Read-Only Input Mount
            "source=${localWorkspaceFolder}/input,target=/workspace/input,type=bind,consistency=cached,readonly",
            // Output Mount
            "source=${localWorkspaceFolder}/output,target=/workspace/output,type=bind"
        ],
        "postCreateCommand": "bash .devcontainer/post-create.sh",
        "remoteUser": "vscode"
    };

    const dockerfileContent = `
FROM mcr.microsoft.com/devcontainers/python:3.10-bullseye

# Install basic utils (gpg for signing if needed inside, though we prefer host signing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg2 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure workspace ownership
RUN chown -R vscode:vscode /workspace
`;

    const postCreateContent = `#!/bin/bash
set -e

# Create venv if not exists
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

# Activate and install
source .venv/bin/activate
pip install -r requirements.txt

# Create initial hashes (if input exists)
echo "Calculating input hashes..."
# This would be where we do the "Black Box" logic start
`;

    // Write files
    await fs.writeJson(path.join(dir, 'devcontainer.json'), devcontainerJson, { spaces: 4 });
    await fs.writeFile(path.join(dir, 'Dockerfile'), dockerfileContent.trim());
    await fs.writeFile(path.join(dir, 'post-create.sh'), postCreateContent);
}

async function hashDirectory(dir: string): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};
    if (!fs.existsSync(dir)) return hashes;

    const files = await fs.readdir(dir);
    for (const file of files) {
        // Skip hidden files/dirs
        if (file.startsWith('.')) continue;

        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
            hashes[file] = await calculateFileHash(filePath);
        }
    }
    return hashes;
}

async function calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', (err: Error) => reject(err));
        stream.on('data', (chunk: any) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function getOrGenerateKey(): Promise<string> {
    const config = vscode.workspace.getConfiguration('immutable');
    let keyId = config.get<string>('gpgKeyId');

    if (keyId && keyId.trim() !== '') {
        return keyId;
    }

    // No key set, check GPG list
    try {
        const { stdout } = await exec('gpg --list-secret-keys --with-colons');
        // Look for 'sec' lines. format: sec:u:2048:1:9E98BC...
        const lines = stdout.split('\n');
        for (const line of lines) {
            if (line.startsWith('sec')) {
                const parts = line.split(':');
                if (parts.length > 4) {
                    keyId = parts[4]; // The Key ID is usually here
                    // Update config
                    await config.update('gpgKeyId', keyId, vscode.ConfigurationTarget.Global);
                    return keyId;
                }
            }
        }
    } catch (e) {
        // ignore, proceed to generate
    }

    // Generate Key
    vscode.window.showInformationMessage("Creating 'Immutable Sandbox' GPG Identity...");

    const batchConfig = `
Key-Type: RSA
Key-Length: 4096
Name-Real: Immutable Sandbox User
Name-Email: sandbox@localhost
Expire-Date: 0
%no-protection
%commit
`;
    const batchPath = path.join(os.tmpdir(), 'gpg_batch_gen');
    await fs.writeFile(batchPath, batchConfig);

    try {
        const { stderr } = await exec(`gpg --batch --gen-key "${batchPath}"`);
        // Extract key from stderr output like "gpg: key 12345678 marked as ultimately trusted"
        // Or re-list
        const { stdout } = await exec('gpg --list-secret-keys --with-colons');
        const lines = stdout.split('\n');
        for (const line of lines) {
            if (line.startsWith('sec')) {
                const parts = line.split(':');
                if (parts.length > 4) {
                    // Just grab the first one if we just generated it (simplistic but works for MVP)
                    keyId = parts[4];
                }
            }
        }
    } finally {
        fs.remove(batchPath).catch(() => { });
    }

    if (keyId) {
        await config.update('gpgKeyId', keyId, vscode.ConfigurationTarget.Global);
        return keyId;
    }

    throw new Error("Could not generate or find a GPG key.");
}
