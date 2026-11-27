using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Net;
using System.Web.Script.Serialization;
using System.Security.Cryptography;
using System.Linq;
using System.Collections.Generic;

[assembly: AssemblyFileVersion(BuildVersion.Value + ".0")]
[assembly: AssemblyProduct("Monexus Workspace Installer")]
internal static class Setup {
    const string Product="Monexus Workspace",Version=BuildVersion.Value,Id="Monexus.Workspace";
    static readonly string Root=InstallPaths.Root;
    static readonly string Shortcut=InstallerShortcuts.PathFor(Environment.SpecialFolder.Programs, Product+".lnk");
    static readonly string InstalledApp=Path.Combine(Root, "app-"+Version, "Monexus.exe");
    const string UninstallKey=InstallPaths.UninstallKey;
    [DllImport("shell32.dll")] static extern void SHChangeNotify(int eventId,uint flags,IntPtr item1,IntPtr item2);
    static readonly string UpdateShortcut=InstallerShortcuts.PathFor(Environment.SpecialFolder.DesktopDirectory, "Update Monexus Workspace.lnk");
    static readonly string DesktopShortcut=InstallerShortcuts.PathFor(Environment.SpecialFolder.DesktopDirectory, Product+".lnk");
    const string InstallerName = "Monexus-Workspace-Setup-x64.exe";
    static Version InstallerVersion(string path) {
        if (String.IsNullOrEmpty(path) || !File.Exists(path)) return null;
        var info = FileVersionInfo.GetVersionInfo(path);
        if (info.ProductName != "Monexus Workspace Installer") return null;
        return new Version(info.FileMajorPart, info.FileMinorPart, info.FileBuildPart);
    }
    static WebClient GitHubClient() {
        var client = new WebClient();
        client.Headers["User-Agent"] = "MonexusWorkspace/" + Version;
        return client;
    }
    static void ShowUpdate() {
        string source = null;
        string assetUrl = null, expectedHash = null;
        Version available = null;
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        var current = new Version(Version);
        using (var form = new Form()) {
            form.Text = "Update Monexus Workspace";
            form.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            form.StartPosition = FormStartPosition.CenterScreen;
            form.FormBorderStyle = FormBorderStyle.FixedDialog;
            form.MaximizeBox = false;
            form.MinimizeBox = false;
            form.ClientSize = new Size(464, 195);
            form.Font = SystemFonts.MessageBoxFont;
            var heading = new Label { Text = "Monexus Workspace " + Version + " is installed", AutoSize = true, Left = 20, Top = 18 };
            heading.Font = new Font(form.Font, FontStyle.Bold);
            var status = new Label { Left = 20, Top = 53, Width = 425, Height = 84 };
            var apply = new Button { Left = 260, Top = 147, Width = 184, Height = 31 };
            var browse = new Button { Text = "Choose installer...", Left = 20, Top = 147, Width = 155, Height = 31 };
            Action refresh = delegate {
                Version found = InstallerVersion(source);
                bool newer = found != null && found > current;
                status.Text = newer ? "Version " + found + " is available in your installer folder." :
                    found == null ? "Choose the latest installer shared by your team to check for an update." :
                    "Your saved installer folder has no newer version. You can also choose an installer shared by your team.";
                apply.Text = newer ? "Install version " + found : "Open installed app";
            };
            form.Shown += async delegate {
                apply.Enabled = browse.Enabled = false;
                status.Text = "Checking GitHub Releases...";
                try {
                    using (var web = GitHubClient()) {
                        var json = await web.DownloadStringTaskAsync(new Uri("https://api.github.com/repos/RafaelAlvizo/MonexusDesktop/releases/latest"));
                        var release = new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(json);
                        string tag = (string)release["tag_name"];
                        if (!System.Text.RegularExpressions.Regex.IsMatch(tag, @"^v\d+\.\d+\.\d+$")) throw new InvalidDataException("Unexpected release version.");
                        available = new Version(tag.Substring(1));
                        if (available > current) {
                            var assets = (System.Collections.IEnumerable)release["assets"];
                            var asset = assets.Cast<Dictionary<string,object>>().Single(a => (string)a["name"] == InstallerName);
                            expectedHash = Convert.ToString(asset["digest"]);
                            if (!System.Text.RegularExpressions.Regex.IsMatch(expectedHash, "^sha256:[0-9a-f]{64}$")) throw new InvalidDataException("Installer checksum is missing.");
                            assetUrl = "https://github.com/RafaelAlvizo/MonexusDesktop/releases/download/" + tag + "/" + InstallerName;
                            status.Text = "Version " + available + " is available from GitHub.";
                            apply.Text = "Install version " + available;
                        } else status.Text = "You are up to date.";
                    }
                } catch (Exception error) { assetUrl = null; status.Text = "Could not check GitHub Releases. " + error.Message; }
                finally { if (!form.IsDisposed) apply.Enabled = browse.Enabled = true; }
            };
            browse.Click += delegate {
                using (var picker = new OpenFileDialog { Title = "Choose the Monexus installer shared by your team", Filter = "Monexus installer (*.exe)|*.exe" }) {
                    if (picker.ShowDialog(form) != DialogResult.OK) return;
                    if (InstallerVersion(picker.FileName) == null) { MessageBox.Show(form, "Choose a Monexus Workspace installer from version 1.2.0 or later."); return; }
                    assetUrl = null; source = picker.FileName;
                    refresh();
                }
            };
            apply.Click += async delegate {
                var found = InstallerVersion(source);
                var installed = InstalledApp;
                try {
                    foreach (var process in Process.GetProcessesByName("Monexus")) {
                        using (process) {
                            if (process.SessionId == Process.GetCurrentProcess().SessionId && (assetUrl != null || (found != null && found > current) || !String.Equals(installed, process.MainModule.FileName, StringComparison.OrdinalIgnoreCase))) {
                                MessageBox.Show(form, "Monexus is running. Save your work, right-click Monexus in the system tray, and select Quit Monexus Workspace. Then click this button again.");
                                return;
                            }
                        }
                    }
                    if (assetUrl != null) {
                        browse.Enabled = apply.Enabled = false;
                        status.Text = "Downloading and verifying version " + available + "...";
                        var folder = Directory.CreateDirectory(Path.Combine(Root, "Updates", available.ToString()));
                        string download = Path.Combine(folder.FullName, InstallerName);
                        using (var web = GitHubClient()) await web.DownloadFileTaskAsync(new Uri(assetUrl), download);
                        if (form.IsDisposed) return;
                        using (var stream = File.OpenRead(download))
                        using (var hash = SHA256.Create()) {
                            string digest = "sha256:" + BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                            if (digest != expectedHash || InstallerVersion(download) != available) throw new InvalidDataException("Release verification failed.");
                        }
                        Process.Start(download, "/wait:" + Process.GetCurrentProcess().Id);
                        form.Close();
                        return;
                    }
                    if (found != null && found > current) Process.Start(source);
                    else InstallPaths.StartInstalledExecutable(installed, "");
                    form.Close();
                } catch (Exception error) { if (!form.IsDisposed) { browse.Enabled = apply.Enabled = true; status.Text = error.Message; } }
            };
            form.Controls.AddRange(new Control[] { heading, status, browse, apply });
            refresh();
            form.ShowDialog();
        }
    }
    static string[] PayloadNames(){using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))using(var z=new ZipArchive(s,ZipArchiveMode.Read)){var names=new System.Collections.Generic.List<string>();foreach(var e in z.Entries)names.Add(e.FullName.Replace('/','\\'));return names.ToArray();}}
    static byte[] Digest(string path) {
        using(var input=File.OpenRead(path))using(var hash=SHA256.Create())return hash.ComputeHash(input);
    }
    static void CopyTree(string source,string target,bool staging) {
        InstallPaths.CheckOrdinary(source);
        Directory.CreateDirectory(target);
        InstallPaths.CheckOrdinary(target);
        foreach(var file in Directory.GetFiles(source)) {
            InstallPaths.CheckOrdinary(file);
            string dest=Path.Combine(target,Path.GetFileName(file));
            if(File.Exists(dest)) {
                InstallPaths.CheckOrdinary(dest);
                if(Digest(file).SequenceEqual(Digest(dest)))continue;
                if(!staging)throw new IOException("A different file already exists in the destination: "+dest);
            }
            File.Copy(file,dest,staging);
            if(!Digest(file).SequenceEqual(Digest(dest)))throw new IOException("Migration could not verify "+file);
        }
        foreach(var dir in Directory.GetDirectories(source))CopyTree(dir,Path.Combine(target,Path.GetFileName(dir)),staging);
    }
    static void MigrateDirectory(string source,string dest,List<Action> cleanup) {
        if(!Directory.Exists(source))return;
        // Only remove the legacy tree after publishing and verifying the copy.
        if(!Directory.Exists(dest)) {
            var staging=dest+".migrating";
            CopyTree(source,staging,true);
            Directory.Move(staging,dest);
        } else CopyTree(source,dest,false);
        cleanup.Add(delegate { Directory.Delete(source,true); });
    }
    static List<Action> MigrateLegacy() {
        var cleanup=new List<Action>();
        var oldRoot=InstallPaths.LocalRoot;
        if(Root==oldRoot)return cleanup;
        var oldData=InstallPaths.LocalData;
        if(Directory.Exists(oldData)) {
            InstallPaths.CheckOrdinary(oldData);
            MigrateDirectory(Path.Combine(oldData,"WebView"),InstallPaths.Profile,cleanup);
            cleanup.Add(delegate { if(Directory.GetFileSystemEntries(oldData).Length==0)Directory.Delete(oldData); });
        }
        if(!Directory.Exists(oldRoot))return cleanup;
        InstallPaths.CheckOrdinary(oldRoot);
        foreach(var dir in Directory.GetDirectories(oldRoot,"app-*")) {
            var name=Path.GetFileName(dir);
            if(System.Text.RegularExpressions.Regex.IsMatch(name,@"^app-\d+\.\d+\.\d+$") && File.Exists(Path.Combine(dir,"Monexus.exe")))
                MigrateDirectory(dir,Path.Combine(Root,name),cleanup);
        }
        var oldSetup=Path.Combine(oldRoot,"MonexusSetup.exe");
        if(InstallerVersion(oldSetup)!=null)cleanup.Add(delegate { File.Delete(oldSetup); });
        cleanup.Add(delegate { if(Directory.GetFileSystemEntries(oldRoot).Length==0)Directory.Delete(oldRoot); });
        return cleanup;
    }
    static string WithInstallerLock(Func<string> operation) {
        using (var guard = new System.Threading.Mutex(false, InstallPaths.InstallerMutex)) {
            bool acquired;
            try { acquired = guard.WaitOne(0); } catch (System.Threading.AbandonedMutexException) { acquired = true; }
            if (!acquired) throw new IOException("Another Monexus installer is already running. Finish that setup, then retry.");
            try { return operation(); } finally { guard.ReleaseMutex(); }
        }
    }

    internal static string Install(SetupOptions options, SetupReport report, Action<int,string> changed) {
        return WithInstallerLock(() => InstallFiles(options, report, (step, text) => { report.Write(text); changed(step, text); }));
    }

    static void PrepareAppDirectory(string directory, string root, Stack<Action> rollback) {
        if (!String.Equals(directory, root, StringComparison.OrdinalIgnoreCase))
            PrepareAppDirectory(Path.GetDirectoryName(directory), root, rollback);
        if (!Directory.Exists(directory)) {
            Directory.CreateDirectory(directory);
            rollback.Push(() => Directory.Delete(directory, false));
        }
        InstallPaths.CheckOrdinary(directory);
    }

    static string InstallFiles(SetupOptions options, SetupReport report, Action<int,string> progress) {
        progress(0, "Checking your installation folder and running apps.");
        if(Process.GetProcessesByName("Monexus").Any(p=>p.SessionId==Process.GetCurrentProcess().SessionId))
            throw new IOException("Save your work and choose Quit Monexus Workspace in the system tray before installing.");
        using (var key = Registry.CurrentUser.OpenSubKey(UninstallKey)) {
            Version existing;
            if (key != null && System.Version.TryParse(key.GetValue("DisplayVersion") as string, out existing) && existing > new Version(Version))
                throw new IOException("A newer version is already installed. Use the latest Monexus installer.");
        }
        InstallPaths.EnsureRoot();
        var temp=Path.Combine(Root,"Staging-"+Guid.NewGuid().ToString("N"));
        var staged = Path.Combine(temp, "app");
        var backups = Path.Combine(temp, "backup");
        var versionDir = Path.Combine(Root, "app-" + Version);
        var rollback = new Stack<Action>();
        bool keepBackup = false, verified = false;
        try {
            Directory.CreateDirectory(staged);
            using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))
            using(var z=new ZipArchive(s,ZipArchiveMode.Read)) z.ExtractToDirectory(staged);
            progress(1, "Checking Microsoft Edge WebView2.");
            WebViewPrerequisite.EnsureInstalled(staged, text => progress(1, text));
            var cleanup=MigrateLegacy();
            progress(2, "Installing and verifying workspace files.");
            using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))
            using(var zip=new ZipArchive(s,ZipArchiveMode.Read))
            using(var hash=SHA256.Create()) {
                foreach(var entry in zip.Entries) {
                    if (entry.Name.Length == 0) continue;
                    string name=entry.FullName.Replace('/','\\');
                    string src=Path.Combine(staged,name), dest=Path.Combine(versionDir,name);
                    string backup=Path.Combine(backups,name);
                    PrepareAppDirectory(Path.GetDirectoryName(dest),versionDir,rollback);
                    if (File.Exists(dest)) {
                        InstallPaths.CheckOrdinary(dest);
                        Directory.CreateDirectory(Path.GetDirectoryName(backup));
                        File.Replace(src,dest,backup);
                        rollback.Push(() => File.Replace(backup,dest,null));
                    } else {
                        File.Move(src,dest);
                        rollback.Push(() => File.Delete(dest));
                    }
                    using(var original=entry.Open())
                        if (!Digest(dest).SequenceEqual(hash.ComputeHash(original))) throw new IOException("File verification failed for "+name+".");
                }
            }
            progress(3, "Opening a test window and loading the installed workspace.");
            string folderPolicy = InstallPaths.FolderOverrideSource();
            report.Write("Profile: " + (folderPolicy != null ? folderPolicy :
                options.Separate || InstallPaths.SelectedProfile() == InstallPaths.SeparateProfile ? "separate" :
                InstallPaths.SelectedProfile() == InstallPaths.Profile ? "original" : "recovery"));
            foreach (var setting in new[] { "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS" })
                if (!String.IsNullOrEmpty(Environment.GetEnvironmentVariable(setting))) report.Write("Configured: " + setting);
            WebViewPrerequisite.VerifyStartup(versionDir, options.Separate, report.Write);
            verified = true;
            progress(4, "Registering Monexus and applying your shortcut choices.");
            string exe=Path.Combine(versionDir,"Monexus.exe"),setup=Path.Combine(Root,"MonexusSetup.exe");
            if(!String.Equals(Application.ExecutablePath,setup,StringComparison.OrdinalIgnoreCase)) {
                string next=Path.Combine(temp,"NextSetup.exe");
                File.Copy(Application.ExecutablePath,next);
                if(File.Exists(setup)) File.Replace(next,setup,null); else File.Move(next,setup);
            }
            var missing = new List<string>();
            if (!InstallerShortcuts.TryCreate(Shortcut, exe, "", Product, Id)) missing.Add("Start menu shortcut");
            ApplyShortcut(DesktopShortcut, options.Desktop, exe, "", "Monexus Workspace", Id, missing);
            ApplyShortcut(UpdateShortcut, options.UpdateDesktop, setup, "/update", "Update Monexus Workspace", null, missing);
            using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Classes\AppUserModelId\"+Id)){k.SetValue("DisplayName",Product);k.SetValue("CustomActivator","{DC295354-75BA-4CEC-849B-1768E030278B}");k.SetValue("IconUri",Path.Combine(versionDir,"Monexus.png"));}
            using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Classes\monexus-workspace")){k.SetValue("","URL:Monexus Workspace");k.SetValue("URL Protocol","");using(var action=k.CreateSubKey(@"shell\open\command"))action.SetValue("","\""+exe+"\"");}
            using(var k=Registry.CurrentUser.CreateSubKey(UninstallKey)){
                k.SetValue("DisplayName",Product);k.SetValue("DisplayVersion",Version);k.SetValue("UpdateSource",setup);k.SetValue("Publisher","Monexus");k.SetValue("DisplayIcon",exe);k.SetValue("InstallLocation",Root);k.SetValue("UninstallString","\""+setup+"\" /uninstall");
                k.SetValue("DesktopShortcut",options.Desktop ? 1 : 0);k.SetValue("UpdateShortcut",options.UpdateDesktop ? 1 : 0);
                if(options.Separate) k.SetValue("UseSeparateProfile",1);
            }
            foreach(var finish in cleanup) {
                try { finish(); } catch(IOException ex) { report.Write("Legacy cleanup: " + ex.Message); }
                catch(UnauthorizedAccessException ex) { report.Write("Legacy cleanup: " + ex.Message); }
            }
            SHChangeNotify(0x08000000,0,IntPtr.Zero,IntPtr.Zero);
            return missing.Count == 0 ? "" : "Windows could not apply these shortcut choices: " + String.Join(", ", missing) + ".";
        } catch {
            if (!verified) while (rollback.Count > 0) {
                try { rollback.Pop()(); }
                catch (Exception error) { keepBackup = true; report.Write("Restore failed: " + error.Message + ". Backup: " + backups); }
            }
            throw;
        } finally {
            // An unfinished Windows prerequisite installer can still hold a staging file.
            try { if (!keepBackup && Directory.Exists(temp)) Directory.Delete(temp, true); }
            catch (IOException) {}
            catch (UnauthorizedAccessException) {}
        }
    }
    static void ApplyShortcut(string path, bool wanted, string target, string arguments, string label, string appId, List<string> missing) {
        if (File.Exists(path) && !InstallerShortcuts.IsMonexusLink(path,Root)) {
            if (wanted) missing.Add(label);
            return;
        }
        if (wanted) {
            if (!InstallerShortcuts.TryCreate(path,target,arguments,label,appId)) missing.Add(label);
        } else if (File.Exists(path)) {
            try { File.Delete(path); }
            catch (IOException) { missing.Add(label); } catch (UnauthorizedAccessException) { missing.Add(label); }
        }
    }
    static void Uninstall(){
        var app=Path.Combine(Root,"app-"+Version);
        foreach(var name in PayloadNames()){var f=Path.Combine(app,name);if(File.Exists(f))File.Delete(f);}
        if(Directory.Exists(app)){var dirs=Directory.GetDirectories(app,"*",SearchOption.AllDirectories);Array.Sort(dirs,(a,b)=>b.Length.CompareTo(a.Length));foreach(var d in dirs)if(Directory.GetFileSystemEntries(d).Length==0)Directory.Delete(d);if(Directory.GetFileSystemEntries(app).Length==0)Directory.Delete(app);}
        if(File.Exists(UpdateShortcut) && InstallerShortcuts.IsMonexusLink(UpdateShortcut,Root))File.Delete(UpdateShortcut);
        if(File.Exists(DesktopShortcut) && InstallerShortcuts.IsMonexusLink(DesktopShortcut,Root))File.Delete(DesktopShortcut);
        if(File.Exists(Shortcut))File.Delete(Shortcut);Registry.CurrentUser.DeleteSubKeyTree(UninstallKey,false);Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\AppUserModelId\"+Id,false);Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\monexus-workspace",false);
        var installedSetup=Path.Combine(Root,"MonexusSetup.exe");if(File.Exists(installedSetup)&&!String.Equals(installedSetup,Application.ExecutablePath,StringComparison.OrdinalIgnoreCase))File.Delete(installedSetup);
        if(Directory.Exists(Root)&&Directory.GetFileSystemEntries(Root).Length==0)Directory.Delete(Root);
    }
    [STAThread] static int Main(string[] args){
        bool silent=Array.Exists(args,a=>a.Equals("/quiet",StringComparison.OrdinalIgnoreCase)),remove=Array.Exists(args,a=>a.Equals("/uninstall",StringComparison.OrdinalIgnoreCase));
        Application.EnableVisualStyles();
        if(Array.Exists(args,a=>a.Equals("/update",StringComparison.OrdinalIgnoreCase))){ShowUpdate();return 0;}
        if(remove&&!silent&&MessageBox.Show("Uninstall Monexus Workspace for this user?",Product,MessageBoxButtons.OKCancel,MessageBoxIcon.Question)!=DialogResult.OK)return 0;
        try{
            if(remove&&String.Equals(Application.ExecutablePath,Path.Combine(Root,"MonexusSetup.exe"),StringComparison.OrdinalIgnoreCase)){
                string helper=Path.Combine(Root,"Monexus-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");File.Copy(Application.ExecutablePath,helper);
                Process.Start(helper,"/uninstall /quiet /wait:"+Process.GetCurrentProcess().Id);return 0;
            }
            foreach(string a in args)if(a.StartsWith("/wait:")){int pid;if(Int32.TryParse(a.Substring(6),out pid))try{Process.GetProcessById(pid).WaitForExit(10000);}catch(ArgumentException){}}
            if (remove) { WithInstallerLock(() => { Uninstall(); return ""; }); return 0; }
            var options = new SetupOptions(args, silent, UpdateShortcut);
            var report = new SetupReport();
            if (!silent) using (var wizard = new SetupWizard(options, report, InstalledApp)) {
                Application.Run(wizard);
                return wizard.Result;
            }
            try {
                string note = Install(options, report, (step, detail) => {});
                report.Write("Installation verified. " + note);
                if (note.Length != 0) Console.Error.WriteLine(note);
            } catch (Exception error) {
                report.Failure(error); Console.Error.WriteLine("Setup report: " + report.FileName); throw;
            }
            return 0;
        }catch(Exception e){if(!silent)MessageBox.Show(e.Message,Product,MessageBoxButtons.OK,MessageBoxIcon.Error);else Console.Error.WriteLine(e.Message);return 1;}
    }
}
