# Monexus Workspace for Windows

Download **Monexus-Workspace-Setup-x64.exe** from the [latest release](https://github.com/RafaelAlvizo/MonexusDesktop/releases/latest). After installing the first GitHub-enabled version, use **Update** to check for newer builds. Save your work and quit Monexus from its tray icon before installing. The updater checks the version and SHA-256 digest against the GitHub release before launching setup.

This repository contains the desktop client. Company records require a verified workspace account. A push to main runs the desktop model tests, builds on Windows and publishes the installer after the build succeeds.

To build locally on Windows x64, install Node.js 22 and run `npm ci` followed by `npm run installer`. The Windows build uses .NET Framework 4.8 and the system WebView2 runtime.
