# Monexus Workspace for Windows

[Download Monexus for Windows (x64)](https://github.com/RafaelAlvizo/MonexusDesktop/releases/latest/download/Monexus-Workspace-Setup-x64.exe). Open the downloaded file, choose your desktop shortcuts and select **Install**. On an existing installation the wizard offers **Update** or **Repair**. Select **Open Monexus** when setup finishes.

Setup installs Microsoft Edge WebView2 if needed, checks the installed files against its package, and opens the local workspace in a test window. Stay connected to the internet if setup needs to download WebView2. If a check fails, the wizard offers **Retry** and **Open setup report**. A separate profile is available for eligible profile conflicts and may require signing in again.

If Monexus is already running, save your work and choose **Quit Monexus Workspace** from its tray icon before installing. For future updates, use **Update** inside Monexus. The updater verifies the version and SHA-256 digest against the GitHub release before launching setup.

This repository contains the desktop client. Company records require a verified workspace account. A push to main runs the desktop model tests, builds on Windows and publishes the installer after the build succeeds.

IT can run the installer with `/quiet` in the intended user's Windows session. The exit code is zero after verification succeeds. Use `/desktop` or `/nodesktop` for the launcher and `/update-shortcut` or `/no-update-shortcut` for the updater. Setup remembers these choices for future updates. Reports are saved in the user's Monexus data folder under `Setup logs`, with the Windows temporary folder as a fallback.

To build locally on Windows x64, install Node.js 22 and run `npm ci` followed by `npm run installer`. The Windows build uses .NET Framework 4.8 and the system WebView2 runtime.
