import * as vscode from 'vscode';
import * as path from 'path';
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
                case 'openFolder':
                    if (data.path) {
                        // Update to IN_PROGRESS and Update Timestamp
                        await this._db.updateExperimentStatus(data.path, 'IN_PROGRESS');
                        await this._db.updateLastOpened(data.path);
                        this.refresh(); // Update UI in background
                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(data.path));
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
                h2 { color: var(--vscode-editor-foreground); }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--vscode-widget-border); }
                th { color: var(--vscode-descriptionForeground); font-weight: 600; }
                tr.row-clickable:hover { background-color: var(--vscode-list-hoverBackground); cursor: pointer; }
                tr.row-locked { opacity: 0.6; cursor: not-allowed; background-color: var(--vscode-list-inactiveSelectionBackground); }
                .btn { 
                    background-color: var(--vscode-button-background); 
                    color: var(--vscode-button-foreground); 
                    border: none; 
                    padding: 8px 12px; 
                    cursor: pointer; 
                    font-size: 13px; 
                    border-radius: 2px;
                }
                .btn:hover { background-color: var(--vscode-button-hoverBackground); }
                .status-created { color: var(--vscode-terminal-ansiYellow); }
                .status-inprogress { color: var(--vscode-terminal-ansiBlue); }
                .status-completed { color: var(--vscode-terminal-ansiGreen); font-weight: bold; }
            </style>
        </head>
        <body>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>Experiment Registry</h2>
                <div>
                   <button class="btn" id="helpBtn" style="margin-right: 5px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);">Help</button>
                   <button class="btn" id="createBtn">New Experiment</button>
                </div>
            </div>
            
            <table id="expTable">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Created</th>
                        <th>Last Opened (UTC)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody id="tableBody">
                    <!-- Data injected by JS -->
                </tbody>
            </table>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                
                document.getElementById('createBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'createSandbox' });
                });

                document.getElementById('helpBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'openWelcome' });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'update':
                            updateTable(message.data);
                            break;
                    }
                });

                function updateTable(experiments) {
                    const tbody = document.getElementById('tableBody');
                    tbody.innerHTML = '';
                    
                    experiments.forEach(exp => {
                        const row = document.createElement('tr');
                        
                        const dateCreated = new Date(exp.created_at).toLocaleString();
                        const dateOpened = exp.last_opened_at ? new Date(exp.last_opened_at).toUTCString().replace('GMT', '') : '-';
                        
                        let statusClass = 'status-created';
                        if (exp.status === 'IN_PROGRESS') statusClass = 'status-inprogress';
                        if (exp.status === 'COMPLETED') statusClass = 'status-completed';

                        const isLocked = exp.status === 'COMPLETED';
                        
                        // Add classes for styling
                        if (isLocked) {
                            row.classList.add('row-locked');
                            row.title = "This experiment is finalized and locked.";
                        } else {
                            row.classList.add('row-clickable');
                            row.title = "Click to open sandbox";
                        }

                        row.innerHTML = \`
                            <td>\${exp.name}</td>
                            <td style="font-size:0.85em">\${dateCreated}</td>
                            <td style="font-size:0.85em">\${dateOpened}</td>
                            <td class="\${statusClass}">\${exp.status}</td>
                        \`;
                        
                        // Only add click listener if NOT locked
                        if (!isLocked) {
                            row.addEventListener('click', () => {
                                 vscode.postMessage({ type: 'openFolder', path: exp.path });
                            });
                        }
                        
                        tbody.appendChild(row);
                    });
                }
                
                // Signal ready
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
