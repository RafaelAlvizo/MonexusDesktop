# Monexus Workspace for Windows

[Download Monexus for Windows (x64)](https://github.com/RafaelAlvizo/MonexusDesktop/releases/latest/download/Monexus-Workspace-Setup-x64.exe). Open the downloaded installer and choose **Yes** when it asks to open Monexus. This link always downloads the latest installer.

If Monexus is already running, save your work and choose **Quit Monexus Workspace** from its tray icon before installing. For future updates, use **Update** inside Monexus. The updater verifies the version and SHA-256 digest against the GitHub release before launching setup.

This repository contains the desktop client. Company records require a verified workspace account. A push to main runs the desktop model tests, builds on Windows and publishes the installer after the build succeeds.

To build locally on Windows x64, install Node.js 22 and run `npm ci` followed by `npm run installer`. The Windows build uses .NET Framework 4.8 and the system WebView2 runtime.
