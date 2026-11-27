using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class WebViewPrerequisite {
    static int Run(string directory, string file, string arguments, int timeout) {
        var start = new ProcessStartInfo(Path.Combine(directory, file), arguments) {
            WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true
        };
        using (var process = Process.Start(start)) {
            if (!process.WaitForExit(timeout))
                throw new IOException("Windows timed out running " + file + ". Restart Windows and run Monexus setup again.");
            return process.ExitCode;
        }
    }

    static bool Available(string directory) {
        int result = Run(directory, "Monexus.exe", "/check-webview", 30000);
        if (result == 0) return true;
        if (result == InstallPaths.RuntimeMissing) return false;
        throw new IOException("Monexus could not check WebView2 on this PC. Windows returned 0x" + result.ToString("X8") + ".");
    }

    static void Install(string directory) {
        const string file = "MicrosoftEdgeWebview2Setup.exe";
        using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("webview2-installer"))
        using (var target = new FileStream(Path.Combine(directory, file), FileMode.CreateNew, FileAccess.Write, FileShare.None))
            source.CopyTo(target);

        int result = Run(directory, file, "/silent /install", 600000);
        for (int attempt = 0; attempt < 5; attempt++) {
            if (Available(directory)) return;
            if (result != 0 || attempt == 4) break;
            Thread.Sleep(1000);
        }
        throw new IOException("Microsoft Edge WebView2 is still unavailable. Connect to the internet and run Monexus setup again. " +
            "If your PC is managed, ask IT to install the Evergreen WebView2 Runtime.\n\nMicrosoft installer code: 0x" + result.ToString("X8"));
    }

    internal static void EnsureInstalled(string directory, bool silent) {
        if (Available(directory)) return;
        string configuredRuntime = Environment.GetEnvironmentVariable("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER");
        if (!String.IsNullOrWhiteSpace(configuredRuntime))
            throw new IOException("Windows is configured to use a specific WebView2 runtime folder, but Monexus could not find a runtime there. " +
                "Ask IT to check WEBVIEW2_BROWSER_EXECUTABLE_FOLDER.\n\n" + configuredRuntime);
        if (silent) { Install(directory); return; }

        using (var dialog = new Form {
            Text = "Monexus Workspace", StartPosition = FormStartPosition.CenterScreen, AutoScaleMode = AutoScaleMode.Dpi,
            FormBorderStyle = FormBorderStyle.FixedDialog, ControlBox = false, ClientSize = new Size(415, 92)
        }) {
            dialog.Controls.Add(new Label { Left = 16, Top = 14, AutoSize = true, Text = "Downloading and installing Microsoft Edge WebView2…" });
            dialog.Controls.Add(new ProgressBar { Left = 16, Top = 48, Width = 383, Style = ProgressBarStyle.Marquee });
            Exception failure = null;
            dialog.Shown += async delegate {
                try { await Task.Run(() => Install(directory)); }
                catch (Exception error) { failure = error; }
                finally { dialog.Close(); }
            };
            dialog.ShowDialog();
            if (failure != null) throw failure;
        }
    }
}
