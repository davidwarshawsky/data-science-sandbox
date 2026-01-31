# Step 4: Pausing & Exiting

The "Immutable Box" runs in a Docker container using VS Code Dev Containers.

### ⏸️ To Pause (Keep State)
- Just **close the VS Code window** (`Ctrl+Shift+W`).
- The container keeps running.
- When you reopen the folder, you pick up exactly where you left off.

### 🛑 To Exit (Stop)
1.  Open Command Palette (`Ctrl+Shift+P`).
2.  Run: **Dev Containers: Reopen Folder Locally**.
3.  This disconnects you from the box and returns you to your local file system.

> **Tip:** Do NOT just type `exit` in the terminal, as VS Code might try to reconnect. Use the command palette.
