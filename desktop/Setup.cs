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
    static readonly string Shortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),Product+".lnk");
    const string UninstallKey=InstallPaths.UninstallKey;
    // IPropertyStore adds the AUMID Windows uses to associate native notifications with this shortcut.
    [StructLayout(LayoutKind.Sequential,Pack=4)] struct PropertyKey { public Guid fmtid; public uint pid; }
    [StructLayout(LayoutKind.Explicit,Size=24)] struct Variant { [FieldOffset(0)]public ushort vt;[FieldOffset(8)] public IntPtr text; }
    [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface PropertyStore { void GetCount(out uint count);void GetAt(uint index,out PropertyKey key);void GetValue(ref PropertyKey key,out Variant value);void SetValue(ref PropertyKey key,ref Variant value);void Commit(); }
    [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=false)] static extern void SHGetPropertyStoreFromParsingName(string path,IntPtr context,int flags,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out PropertyStore store);
    [DllImport("shell32.dll")] static extern void SHChangeNotify(int eventId,uint flags,IntPtr item1,IntPtr item2);
    static void RegisterShortcut(string exe) {
        dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic link=shell.CreateShortcut(Shortcut);
        link.TargetPath=exe;link.WorkingDirectory=Root;link.IconLocation=exe+",0";link.Save();
        Guid guid=typeof(PropertyStore).GUID;PropertyStore store;SHGetPropertyStoreFromParsingName(Shortcut,IntPtr.Zero,2,ref guid,out store);
        var key=new PropertyKey{fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),pid=5};
        var value=new Variant{vt=31,text=Marshal.StringToCoTaskMemUni(Id)};
        try{store.SetValue(ref key,ref value);}finally{Marshal.FreeCoTaskMem(value.text);}
        key.pid=26;
        value=new Variant{vt=72,text=Marshal.AllocCoTaskMem(16)};
        try{Marshal.StructureToPtr(new Guid("DC295354-75BA-4CEC-849B-1768E030278B"),value.text,false);store.SetValue(ref key,ref value);store.Commit();}finally{Marshal.FreeCoTaskMem(value.text);}
    }
    static readonly string UpdateShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Update Monexus Workspace.lnk");
    const string InstallerName = "Monexus-Workspace-Setup-x64.exe";
    static void RegisterUpdateShortcut(string setup) {
        dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
        dynamic link = shell.CreateShortcut(UpdateShortcut);
        link.TargetPath = setup;
        link.Arguments = "/update";
        link.WorkingDirectory = Root;
        link.IconLocation = setup + ",0";
        link.Description = "Check for a Monexus Workspace update";
        link.Save();
    }
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
                var installed = Path.Combine(Root, "app-" + Version, "Monexus.exe");
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
                    Process.Start(found != null && found > current ? source : installed);
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
    static void Install() {
        if(Process.GetProcessesByName("Monexus").Any(p=>p.SessionId==Process.GetCurrentProcess().SessionId))
            throw new IOException("Save your work and choose Quit Monexus Workspace in the system tray before installing.");
        InstallPaths.EnsureRoot();
        var temp=Path.Combine(Root,"Staging-"+Guid.NewGuid().ToString("N"));
        try {
            Directory.CreateDirectory(temp);using(var s=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))using(var z=new ZipArchive(s,ZipArchiveMode.Read))z.ExtractToDirectory(temp);
            var versionDir=Path.Combine(Root,"app-"+Version);Directory.CreateDirectory(versionDir);
            foreach(var name in PayloadNames()){var dest=Path.Combine(versionDir,name);Directory.CreateDirectory(Path.GetDirectoryName(dest));File.Copy(Path.Combine(temp,name),dest,true);}
            string exe=Path.Combine(versionDir,"Monexus.exe"),setup=Path.Combine(Root,"MonexusSetup.exe");
            if(!String.Equals(Application.ExecutablePath,setup,StringComparison.OrdinalIgnoreCase))File.Copy(Application.ExecutablePath,setup,true);
            var cleanup=MigrateLegacy();
            RegisterShortcut(exe);
            RegisterUpdateShortcut(setup);
            using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Classes\AppUserModelId\"+Id)){k.SetValue("DisplayName",Product);k.SetValue("CustomActivator","{DC295354-75BA-4CEC-849B-1768E030278B}");k.SetValue("IconUri",Path.Combine(versionDir,"Monexus.png"));}
            using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Classes\monexus-workspace")){k.SetValue("","URL:Monexus Workspace");k.SetValue("URL Protocol","");using(var action=k.CreateSubKey(@"shell\open\command"))action.SetValue("","\""+exe+"\"");}
            using(var k=Registry.CurrentUser.CreateSubKey(UninstallKey)){k.SetValue("DisplayName",Product);k.SetValue("DisplayVersion",Version);k.SetValue("UpdateSource",setup);k.SetValue("Publisher","Monexus");k.SetValue("DisplayIcon",exe);k.SetValue("InstallLocation",Root);k.SetValue("UninstallString","\""+setup+"\" /uninstall");}
            foreach(var finish in cleanup)finish();
            SHChangeNotify(0x08000000,0,IntPtr.Zero,IntPtr.Zero);
        }finally{if(Directory.Exists(temp))Directory.Delete(temp,true);}
    }
    static void Uninstall(){
        var app=Path.Combine(Root,"app-"+Version);
        foreach(var name in PayloadNames()){var f=Path.Combine(app,name);if(File.Exists(f))File.Delete(f);}
        if(Directory.Exists(app)){var dirs=Directory.GetDirectories(app,"*",SearchOption.AllDirectories);Array.Sort(dirs,(a,b)=>b.Length.CompareTo(a.Length));foreach(var d in dirs)if(Directory.GetFileSystemEntries(d).Length==0)Directory.Delete(d);if(Directory.GetFileSystemEntries(app).Length==0)Directory.Delete(app);}
        if(File.Exists(UpdateShortcut))File.Delete(UpdateShortcut);
        if(File.Exists(Shortcut))File.Delete(Shortcut);Registry.CurrentUser.DeleteSubKeyTree(UninstallKey,false);Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\AppUserModelId\"+Id,false);Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\monexus-workspace",false);
        var installedSetup=Path.Combine(Root,"MonexusSetup.exe");if(File.Exists(installedSetup)&&!String.Equals(installedSetup,Application.ExecutablePath,StringComparison.OrdinalIgnoreCase))File.Delete(installedSetup);
        if(Directory.Exists(Root)&&Directory.GetFileSystemEntries(Root).Length==0)Directory.Delete(Root);
    }
    [STAThread] static int Main(string[] args){
        bool silent=Array.Exists(args,a=>a.Equals("/quiet",StringComparison.OrdinalIgnoreCase)),remove=Array.Exists(args,a=>a.Equals("/uninstall",StringComparison.OrdinalIgnoreCase));
        Application.EnableVisualStyles();
        if(Array.Exists(args,a=>a.Equals("/update",StringComparison.OrdinalIgnoreCase))){ShowUpdate();return 0;}
        if(!silent&&MessageBox.Show(remove?"Uninstall Monexus Workspace for this user?":"Install Monexus Workspace for this user?",Product,MessageBoxButtons.OKCancel,MessageBoxIcon.Information)!=DialogResult.OK)return 0;
        try{
            if(remove&&String.Equals(Application.ExecutablePath,Path.Combine(Root,"MonexusSetup.exe"),StringComparison.OrdinalIgnoreCase)){
                string helper=Path.Combine(Root,"Monexus-Uninstall-"+Guid.NewGuid().ToString("N")+".exe");File.Copy(Application.ExecutablePath,helper);
                Process.Start(helper,"/uninstall /quiet /wait:"+Process.GetCurrentProcess().Id);return 0;
            }
            foreach(string a in args)if(a.StartsWith("/wait:")){int pid;if(Int32.TryParse(a.Substring(6),out pid))try{Process.GetProcessById(pid).WaitForExit(10000);}catch(ArgumentException){}}
            using(var guard=new System.Threading.Mutex(false,@"Local\MonexusWorkspaceInstaller-"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value)){
                bool acquired;
                try{acquired=guard.WaitOne(0);}catch(System.Threading.AbandonedMutexException){acquired=true;}
                if(!acquired)throw new IOException("Another Monexus installer is already running.");
                try{if(remove)Uninstall();else Install();}finally{guard.ReleaseMutex();}
            }
            if(!silent&&!remove&&MessageBox.Show("Open Monexus Workspace now?",Product,MessageBoxButtons.YesNo)==DialogResult.Yes)Process.Start(Shortcut);
            return 0;
        }catch(Exception e){if(!silent)MessageBox.Show(e.Message,Product,MessageBoxButtons.OK,MessageBoxIcon.Error);else Console.Error.WriteLine(e.Message);return 1;}
    }
}
