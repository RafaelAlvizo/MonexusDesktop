using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal sealed class SetupOptions {
    internal bool Desktop, UpdateDesktop, Separate;
    internal readonly string Action;
    internal SetupOptions(string[] args, bool quiet, string updateShortcut) {
        using (var key = Registry.CurrentUser.OpenSubKey(InstallPaths.UninstallKey)) {
            string installed = key == null ? null : key.GetValue("DisplayVersion") as string;
            Action = installed == null ? "Install" : installed == BuildVersion.Value ? "Repair" : "Update";
            Desktop = key == null || !Equals(key.GetValue("DesktopShortcut"), 0);
            UpdateDesktop = key == null ? quiet : Equals(key.GetValue("UpdateShortcut", File.Exists(updateShortcut) ? 1 : 0), 1);
        }
        foreach (string arg in args) switch (arg.ToLowerInvariant()) {
            case "/desktop": Desktop = true; break;
            case "/nodesktop": Desktop = false; break;
            case "/update-shortcut": UpdateDesktop = true; break;
            case "/no-update-shortcut": UpdateDesktop = false; break;
        }
    }
}

internal sealed class SetupReport {
    internal readonly string FileName;
    internal SetupReport() {
        string name = "Monexus-Setup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".txt";
        foreach (string dir in new[] { Path.Combine(Path.GetDirectoryName(InstallPaths.Profile), "Setup logs"), Path.GetTempPath() }) {
            try {
                Directory.CreateDirectory(dir);
                string file = Path.Combine(dir, name);
                File.WriteAllText(file, "Monexus Workspace " + BuildVersion.Value + Environment.NewLine +
                    "Windows " + Environment.OSVersion.Version + Environment.NewLine);
                FileName = file; break;
            } catch (IOException) {} catch (UnauthorizedAccessException) {}
        }
    }
    internal void Write(string message) {
        if (FileName == null) return;
        try { File.AppendAllText(FileName, DateTime.Now.ToString("HH:mm:ss") + "  " + message + Environment.NewLine); }
        catch (IOException) {} catch (UnauthorizedAccessException) {}
    }
    internal void Failure(Exception error) {
        Write(error.GetType().Name + " (0x" + error.HResult.ToString("X8") + "): " + error.Message);
    }
}

internal sealed class SetupWizard : Form {
    enum Page { Options, Working, Done, Failed }
    readonly SetupOptions options;
    readonly SetupReport report;
    readonly string app;
    readonly Label heading = new Label(), detail = new Label(), location = new Label();
    readonly CheckBox desktop = new CheckBox(), updater = new CheckBox(), separate = new CheckBox();
    readonly ProgressBar progress = new ProgressBar();
    readonly FlowLayoutPanel body = new FlowLayoutPanel();
    readonly Button primary = new Button(), secondary = new Button();
    readonly LinkLabel openReport = new LinkLabel();
    Page page;
    internal int Result { get; private set; }
    static readonly Color Green = Color.FromArgb(26, 75, 57);

    internal SetupWizard(SetupOptions choices, SetupReport log, string executable) {
        options = choices; report = log; app = executable;
        Text = "Monexus Workspace Setup";
        Font = new Font("Segoe UI", 10F); AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(580, 441); MinimumSize = Size;
        StartPosition = FormStartPosition.CenterScreen; MaximizeBox = false; BackColor = Color.White;
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Margin = Padding.Empty };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 75)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64)); Controls.Add(layout);
        var header = new FlowLayoutPanel { Dock = DockStyle.Fill, BackColor = Green, Padding = new Padding(22,17,0,0), Margin = Padding.Empty, WrapContents = false };
        header.Controls.Add(new PictureBox { Image = Icon.ToBitmap(), SizeMode = PictureBoxSizeMode.Zoom, Width = 38, Height = 38 });
        header.Controls.Add(new Label { Text = "Monexus Workspace", AutoSize = true, ForeColor = Color.White,
            Font = new Font(Font.FontFamily, 16, FontStyle.Bold), Margin = new Padding(10,4,0,0) });
        layout.Controls.Add(header, 0, 0);
        body.Dock = DockStyle.Fill; body.FlowDirection = FlowDirection.TopDown; body.WrapContents = false;
        body.AutoScroll = true; body.Padding = new Padding(22,14,22,3); body.Margin = Padding.Empty;
        heading.AutoSize = detail.AutoSize = location.AutoSize = true;
        heading.Font = new Font(Font.FontFamily, 15, FontStyle.Bold);
        detail.Margin = new Padding(3,5,3,10); location.ForeColor = Color.DimGray;
        desktop.AutoSize = updater.AutoSize = separate.AutoSize = true;
        desktop.Text = "Create a desktop shortcut to Monexus";
        updater.Text = "Add an update shortcut to the desktop";
        separate.Text = "Try a separate Monexus profile (you may need to sign in again)";
        desktop.Checked = options.Desktop; updater.Checked = options.UpdateDesktop;
        progress.Height = 10; progress.Maximum = 5; progress.Margin = new Padding(3,7,3,10);
        location.Margin = new Padding(3,12,3,0);
        body.Controls.AddRange(new Control[] { heading, detail, progress, desktop, updater, separate, location });
        layout.Controls.Add(body,0,1);
        body.SizeChanged += delegate {
            int width = Math.Max(180, body.ClientSize.Width - body.Padding.Horizontal - 24);
            detail.MaximumSize = heading.MaximumSize = location.MaximumSize = new Size(width,0); progress.Width = width;
        };
        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(244,246,245),
            ColumnCount = 3, RowCount = 1, Padding = new Padding(22,10,18,10), Margin = Padding.Empty };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); footer.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        openReport.Text = "Open setup report"; openReport.AutoSize = true; openReport.Anchor = AnchorStyles.Left;
        openReport.LinkColor = Green; openReport.LinkClicked += delegate {
            try { InstallPaths.StartInstalledExecutable(Path.Combine(Environment.SystemDirectory,"notepad.exe"), "\"" + report.FileName + "\""); }
            catch (Exception error) { MessageBox.Show(this, error.Message + "\n\n" + report.FileName, Text); }
        };
        foreach (var button in new[] { primary, secondary }) { button.AutoSize = true; button.MinimumSize = new Size(87,33); button.Anchor = AnchorStyles.Right; }
        primary.FlatStyle = FlatStyle.Flat; primary.FlatAppearance.BorderSize = 0; primary.BackColor = Green; primary.ForeColor = Color.White;
        primary.Click += delegate { if (page == Page.Done) OpenWorkspace(); else BeginInstall(); };
        secondary.Click += delegate { Close(); };
        footer.Controls.Add(openReport,0,0); footer.Controls.Add(secondary,1,0); footer.Controls.Add(primary,2,0);
        layout.Controls.Add(footer,0,2); AcceptButton = primary; CancelButton = secondary;
        FormClosing += (s,e) => { if (page == Page.Working) e.Cancel = true; };
        heading.Text = options.Action + " Monexus Workspace";
        detail.Text = "Setup will check Microsoft Edge WebView2, verify the app files, and test the workspace on this PC.";
        location.Text = "Version " + BuildVersion.Value + "\n" + InstallPaths.Root;
        primary.Text = options.Action; secondary.Text = "Cancel";
        separate.Visible = progress.Visible = openReport.Visible = false;
    }

    void BeginInstall() {
        options.Desktop = desktop.Checked; options.UpdateDesktop = updater.Checked;
        options.Separate = separate.Visible && separate.Checked;
        page = Page.Working; Result = 1;
        heading.Text = options.Action == "Repair" ? "Repairing Monexus" : options.Action == "Update" ? "Updating Monexus" : "Installing Monexus";
        desktop.Visible = updater.Visible = separate.Visible = openReport.Visible = location.Visible = false;
        primary.Enabled = secondary.Enabled = false; progress.Value = 0; progress.Visible = true;
        detail.Text = "Preparing setup…";
        var worker = new Thread(() => {
            try {
                string note = Setup.Install(options, report, (step, text) => BeginInvoke(new Action(() => {
                    progress.Value = step + 1; detail.Text = text;
                })));
                report.Write("Installation verified. " + note);
                BeginInvoke(new Action(() => Finish(note, null)));
            } catch (Exception error) {
                report.Failure(error); BeginInvoke(new Action(() => Finish("", error)));
            }
        });
        worker.SetApartmentState(ApartmentState.STA); worker.Start();
    }

    void Finish(string note, Exception error) {
        page = error == null ? Page.Done : Page.Failed; Result = error == null ? 0 : 1;
        progress.Visible = false; primary.Enabled = secondary.Enabled = true;
        openReport.Visible = report.FileName != null; secondary.Text = "Close";
        if (error == null) {
            heading.Text = "Monexus is ready";
            detail.Text = "The installed workspace opened successfully on this PC." + (note.Length > 0 ? "\n\n" + note : "");
            primary.Text = "Open Monexus"; return;
        }
        heading.Text = "Setup needs attention"; primary.Text = "Retry";
        detail.Text = error.Message;
        var startup = error as WebViewPrerequisite.StartupFailure;
        if (startup != null) {
            bool folderError = startup.Code == unchecked((int)0x8007139F) || startup.Code == unchecked((int)0x80070005);
            separate.Visible = folderError && !InstallPaths.HasFolderOverride() && InstallPaths.SelectedProfile() != InstallPaths.SeparateProfile;
            separate.Checked = options.Separate;
            if (separate.Visible && !options.Separate) detail.Text += "\n\nRestart Windows and retry, or select a separate profile below. Your original profile is kept.";
            else detail.Text += "\n\nShare the setup report with your Monexus contact or IT.";
        }
    }

    void OpenWorkspace() {
        try { InstallPaths.StartInstalledExecutable(app,""); Close(); }
        catch(Exception error) { report.Failure(error); detail.Text = "Windows could not launch Monexus. " + error.Message; }
    }
}
