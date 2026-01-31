import * as vscode from 'vscode';
import * as path from 'path';

export class WelcomePanel {
    public static currentPanel: WelcomePanel | undefined;
    public static readonly viewType = 'immutableWelcome';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (WelcomePanel.currentPanel) {
            WelcomePanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            WelcomePanel.viewType,
            'Immutable Sandbox: Welcome',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
            }
        );

        WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'createSandbox':
                        vscode.commands.executeCommand('immutable.createSandbox');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        WelcomePanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome into the Box</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        line-height: 1.6;
                        max-width: 800px;
                        margin: 0 auto;
                        color: var(--vscode-editor-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    h1 { font-size: 2em; margin-bottom: 0.5em; color: var(--vscode-textLink-activeForeground); }
                    h2 { margin-top: 1.5em; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 5px; }
                    code { background-color: var(--vscode-textBlockQuote-background); padding: 2px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family); }
                    pre { background-color: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 5px; overflow-x: auto; }
                    .step { margin-bottom: 20px; padding: 15px; border: 1px solid var(--vscode-widget-border); border-radius: 5px; }
                    .step-title { font-weight: bold; font-size: 1.1em; margin-bottom: 10px; display: block; }
                    .btn {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 10px 20px;
                        font-size: 1.1em;
                        cursor: pointer;
                        border-radius: 2px;
                        margin-top: 20px;
                    }
                    .btn:hover { background-color: var(--vscode-button-hoverBackground); }
                    .manifest-preview { font-size: 0.9em; color: var(--vscode-descriptionForeground); }
                </style>
            </head>
            <body>
                <h1>Immutable Regulatory Sandbox</h1>
                <p>Welcome to your trust-minimized data science environment. This extension ensures that your work is reproducible, tamper-proof, and audit-ready.</p>

                <button class="btn" onclick="createSandbox()">Create Your First Sandbox</button>

                <h2>How it Works</h2>
                
                <div class="step">
                    <span class="step-title">1. The Box (Read-Only Input)</span>
                    <p>When you create a sandbox, we generate a Docker Dev Container. Your <code>input/</code> folder is mounted as <strong>READ-ONLY</strong>. You cannot accidentally modify your raw data, ensuring integrity from the start.</p>
                </div>

                <div class="step">
                    <span class="step-title">2. The Work (Isolated Environment)</span>
                    <p>All your work happens inside the container. Dependencies are pinned. You write results to the <code>output/</code> folder, which is the only writeable text area.</p>
                </div>

                <div class="step">
                    <span class="step-title">3. The Finalization (Proof Generation)</span>
                    <p>When done, click "Finalize Experiment". We enforce a freeze:</p>
                    <ul>
                        <li>Hash all input files (SHA-256).</li>
                        <li>Hash all output files.</li>
                        <li>Snapshot your code.</li>
                        <li>Sign the Manifest with your GPG key.</li>
                        <li>Timestamp the Manifest with a public RFC 3161 authority (FreeTSA).</li>
                    </ul>
                </div>

                <h2>The Verification Receipt</h2>
                <p>This is what you hand to the regulator. A mathematically verifiable proof of what you did.</p>
                <pre class="manifest-preview">
{
  "timestamp": "2026-01-31T23:45:00Z",
  "input_hashes": {
    "data.csv": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "output_hashes": {
    "model.pkl": "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
  },
  "signature": "-----BEGIN PGP SIGNATURE-----\\n..."
}
                </pre>

                <script>
                    const vscode = acquireVsCodeApi();
                    function createSandbox() {
                        vscode.postMessage({ command: 'createSandbox' });
                    }
                </script>
            </body>
            </html>`;
    }
}
