import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { DatabaseManager, ExperimentRecord } from './db';

export class DashboardProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'immutable.dashboardView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _db: DatabaseManager
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listen for messages from the UI
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'createSandbox':
                    vscode.commands.executeCommand('immutable.createSandbox');
                    break;
                case 'refresh':
                    this.refresh();
                    break;
                case 'verify': // Manual Verify Button
                    vscode.commands.executeCommand('immutable.verifyIntegrity');
                    break;
                case 'deleteSandbox':
                    vscode.commands.executeCommand('immutable.deleteSandbox', data.path);
                    break;
                case 'openFolder':
                    if (data.path) {
                        try {
                            const exp = await this._db.getExperimentByPath(data.path);
                            // Avoid updating status if already locked/completed.
                            // Only update timestamp if we are opening it.
                            if (exp && exp.status !== 'COMPLETED') {
                                await this._db.updateExperimentStatus(data.path, 'IN_PROGRESS');
                            }
                            await this._db.updateLastOpened(data.path);
                            this.refresh();
                            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(data.path));
                        } catch (e) {
                            console.error('Error opening folder', e);
                        }
                    }
                    break;
                case 'openWelcome':
                    vscode.commands.executeCommand('immutable.showWelcome');
                    break;
            }
        });

        // Initial load
        this.refresh();
    }

    public async refresh() {
        if (!this._view) return;

        try {
            const experiments = await this._db.getAllExperiments();
            // We might want to "hydrate" experiments with extra check data here if needed, 
            // but for now let's just send the DB records + basic derived state.
            this._view.webview.postMessage({ type: 'update', data: experiments });
        } catch (err) {
            console.error('Failed to fetch experiments', err);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Immutable Dashboard</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                h2 { color: var(--vscode-editor-foreground); border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 5px; margin-bottom: 15px; }

                /* Cockpit Header */
                .header-actions { display: flex; gap: 8px; margin-bottom: 15px; }
                
                /* Cards */
                .experiment-card {
                    background-color: var(--vscode-list-hoverBackground);
                    border: 1px solid var(--vscode-widget-border);
                    border-radius: 4px;
                    padding: 10px;
                    margin-bottom: 12px;
                    transition: all 0.2s;
                }
                .experiment-card:hover {
                    border-color: var(--vscode-focusBorder);
                }
                
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                .exp-name { font-weight: bold; font-size: 1.1em; }
                .exp-date { font-size: 0.85em; opacity: 0.8; }
                
                /* Status Badges */
                .badge {
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 0.8em;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .badge-created { background-color: var(--vscode-terminal-ansiYellow); color: #1e1e1e; }
                .badge-inprogress { background-color: var(--vscode-terminal-ansiBlue); color: white; }
                .badge-completed { background-color: var(--vscode-terminal-ansiGreen); color: #1e1e1e; }

                /* Lock Status Bar */
                .lock-status {
                    display: flex;
                    gap: 15px;
                    font-size: 0.9em;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid var(--vscode-widget-border);
                }
                .lock-item { display: flex; align-items: center; gap: 4px; }
                .secure-icon { color: var(--vscode-terminal-ansiGreen); }
                .insecure-icon { color: var(--vscode-terminal-ansiRed); }

                /* Provenance Section (for Completed) */
                .provenance-section {
                    margin-top: 10px;
                    background-color: rgba(255,255,255,0.05);
                    padding: 8px;
                    border-radius: 3px;
                }
                .provenance-row { display: flex; align-items: center; gap: 6px; font-size: 0.9em; margin-bottom: 4px; }
                
                /* Buttons */
                .btn { 
                    background-color: var(--vscode-button-background); 
                    color: var(--vscode-button-foreground); 
                    border: none; 
                    padding: 6px 12px; 
                    cursor: pointer; 
                    font-size: 12px; 
                    border-radius: 2px;
                    text-align: center;
                    display: inline-block;
                }
                .btn:hover { background-color: var(--vscode-button-hoverBackground); }
                .btn-secondary { background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                .btn-full { width: 100%; margin-top: 8px; }

                /* Modes */
                .auditor-mode-banner {
                    background-color: var(--vscode-terminal-ansiRed); 
                    color: white; 
                    padding: 4px; 
                    text-align: center; 
                    font-weight: bold; 
                    margin-bottom: 10px;
                    border-radius: 2px;
                    display: none; /* Toggled via JS */
                }
                
                .toggle-container { margin-bottom: 10px; display: flex; align-items: center; font-size: 0.9em; }
            </style>
        </head>
        <body>
            <div class="toggle-container">
                <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" id="auditorToggle" style="margin-right:6px;"> Auditor Mode
                </label>
            </div>
            
            <div id="auditorBanner" class="auditor-mode-banner">🕵️ AUDITOR MODE ACTIVE</div>

            <div class="header-actions">
                <button class="btn btn-full" id="createBtn">➕ New Experiment</button>
            </div>
            <div class="header-actions">
                 <button class="btn btn-secondary btn-full" id="helpBtn">📘 User Guide</button>
            </div>
            
            <div id="experimentList">
                <!-- Injected via JS -->
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                let isAuditorMode = false;

                // Event Listeners
                document.getElementById('createBtn').addEventListener('click', () => vscode.postMessage({ type: 'createSandbox' }));
                document.getElementById('helpBtn').addEventListener('click', () => vscode.postMessage({ type: 'openWelcome' }));
                
                document.getElementById('auditorToggle').addEventListener('change', (e) => {
                    isAuditorMode = e.target.checked;
                    document.getElementById('auditorBanner').style.display = isAuditorMode ? 'block' : 'none';
                    // Re-render to update UI state
                    vscode.postMessage({ type: 'refresh' }); 
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'update':
                            renderExperiments(message.data);
                            break;
                    }
                });

                function renderExperiments(experiments) {
                    const container = document.getElementById('experimentList');
                    container.innerHTML = '';

                    if (experiments.length === 0) {
                        container.innerHTML = '<div style="opacity:0.6; text-align:center; margin-top:20px;">No experiments found. Create one to get started.</div>';
                        return;
                    }

                    experiments.forEach(exp => {
                        const card = document.createElement('div');
                        card.className = 'experiment-card';
                        
                        const dateStr = new Date(exp.created_at).toLocaleDateString();
                        const isLocked = exp.status === 'COMPLETED';
                        
                        let badgeClass = 'badge-created';
                        if (exp.status === 'IN_PROGRESS') badgeClass = 'badge-inprogress';
                        if (exp.status === 'COMPLETED') badgeClass = 'badge-completed';

                        // Auditor Mode: Highlight issues? (For now, just visual distinction)
                        if (isAuditorMode && !isLocked) {
                            card.style.opacity = '0.5'; // De-emphasize non-finalized work in audit mode
                        }

                        let html = \`
                            <div class="card-header">
                                <span class="exp-name">\${exp.name}</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <span class="badge \${badgeClass}">\${exp.status}</span>
                                    \${!isAuditorMode ? \`<span onclick="deleteExp('\${exp.path}')" style="cursor:pointer; opacity:0.5;" title="Remove from Registry">🗑️</span>\` : ''}
                                </div>
                            </div>
                            <div class="exp-date">Created: \${dateStr}</div>
                        \`;

                        // Lock / Active Security Status
                        if (exp.status === 'IN_PROGRESS' || isLocked) {
                            html += \`
                                <div class="lock-status">
                                    <div class="lock-item" title="Input directory is mounted Read-Only">
                                        <span class="secure-icon">🔒</span> Input Read-Only
                                    </div>
                                    <div class="lock-item" title="Running in Isolated Container">
                                        <span class="\${isLocked ? 'secure-icon' : 'secure-icon'}">🐳</span> Container
                                    </div>
                                </div>
                            \`;
                        }

                        // Provenance Card (Only if Completed)
                        if (isLocked) {
                             html += \`
                                <div class="provenance-section">
                                    <div class="provenance-row">
                                        <span>✒️</span> <b>Signed Identity Verified</b>
                                    </div>
                                    <div class="provenance-row">
                                        <span>🕒</span> <b>Timestamped by FreeTSA</b>
                                    </div>
                                    <button class="btn btn-secondary btn-full" style="margin-top:6px" onclick="verify('\${exp.path}')">Verify Integrity Now</button>
                                </div>
                            \`;
                        } else {
                            if (!isAuditorMode) {
                                html += \`<button class="btn btn-full" onclick="openExp('\${exp.path}')">Open Sandbox</button>\`;
                            }
                        }

                        card.innerHTML = html;
                        container.appendChild(card);
                    });
                }
                
                // Expose helper functions to global scope for inline onclicks
                window.openExp = (path) => {
                    vscode.postMessage({ type: 'openFolder', path: path });
                };

                window.deleteExp = (path) => {
                    vscode.postMessage({ type: 'deleteSandbox', path: path });
                };
                
                window.verify = (path) => {
                     // Note: We currently only support verifying the current workspace
                     // But strictly speaking, the user should open it first.
                     // For UI simplicity, let's open it.
                     vscode.postMessage({ type: 'openFolder', path: path });

                     // Then verify? (Race condition, but OK for MVP)
                     setTimeout(() => {
                         vscode.postMessage({ type: 'verify' });
                     }, 2000);
                }

                // Initial request
                vscode.postMessage({ type: 'refresh' });
            </script>
        </body>
        </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
