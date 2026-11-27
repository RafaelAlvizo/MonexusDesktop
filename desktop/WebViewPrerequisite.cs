using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;

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

    internal sealed class StartupFailure : IOException {
        internal readonly int Code;
        internal StartupFailure(int code, string detail) : base(
            "Windows could not open the local workspace (0x" + code.ToString("X8") + ")." +
            (String.IsNullOrWhiteSpace(detail) ? "" : "\n" + detail.Trim())) { Code = code; }
    }

    internal static void VerifyStartup(string directory, bool separate, Action<string> log) {
        var start = new ProcessStartInfo(Path.Combine(directory, "Monexus.exe"),
            separate ? "/verify-startup /separate-profile" : "/verify-startup") {
            UseShellExecute = false, WorkingDirectory = directory, CreateNoWindow = true, RedirectStandardOutput = true
        };
        using (var child = Process.Start(start)) {
            var output = child.StandardOutput.ReadToEndAsync();
            if (!child.WaitForExit(65000)) {
                try { child.Kill(); child.WaitForExit(5000); } catch (InvalidOperationException) {}
                throw new TimeoutException("Windows did not finish the startup check. Restart Windows and retry setup.");
            }
            string detail = output.Wait(1500) ? output.Result.Trim() : "";
            if (detail.Length != 0) log(detail);
            if (child.ExitCode != 0) throw new StartupFailure(child.ExitCode, detail);
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

    internal static void EnsureInstalled(string directory, Action<string> progress) {
        if (Available(directory)) return;
        string configuredRuntime = Environment.GetEnvironmentVariable("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER");
        if (!String.IsNullOrWhiteSpace(configuredRuntime))
            throw new IOException("Windows is configured to use a specific WebView2 runtime folder, but Monexus could not find a runtime there. " +
                "Ask IT to check WEBVIEW2_BROWSER_EXECUTABLE_FOLDER.\n\n" + configuredRuntime);
        progress("Downloading and installing Microsoft Edge WebView2. Keep this PC connected to the internet.");
        Install(directory);
    }
}
