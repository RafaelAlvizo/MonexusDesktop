using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

internal class WorkspaceWindow : Form {
    const string Origin = "https://workspace.monexus.local";
    const string AppId = "Monexus.Workspace";
    readonly WebView2 view = new WebView2();
    readonly Dictionary<string,Form> callWindows = new Dictionary<string,Form>();
    readonly NotifyIcon tray = new NotifyIcon();
    readonly EventWaitHandle showEvent;
    RegisteredWaitHandle showWait;
    bool quitting;
    int unread;
    Icon badgeIcon;
    const int OverlaySlot=18;
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int TaskbarInit(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall,CharSet=CharSet.Unicode)] delegate int SetOverlay(IntPtr self,IntPtr hwnd,IntPtr icon,[MarshalAs(UnmanagedType.LPWStr)]string description);
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern uint RegisterWindowMessage(string name);
    static readonly uint TaskbarReady=RegisterWindowMessage("TaskbarButtonCreated");
    protected override void WndProc(ref Message message){base.WndProc(ref message);if(message.Msg==TaskbarReady && unread>0)SetBadge(unread);}
    static Icon CreateBadgeIcon(int unread) {
        if(unread<=0)return null;
        using(var bitmap=new Bitmap(32,32))
        using(var g=Graphics.FromImage(bitmap))
        using(var font=new Font("Segoe UI",unread>9?12:16,FontStyle.Bold,GraphicsUnit.Pixel))
        using(var format=new StringFormat { Alignment=StringAlignment.Center, LineAlignment=StringAlignment.Center }) {
            g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.FillEllipse(Brushes.Firebrick,0,0,31,31);
            g.DrawString(unread>=100?"99+":unread.ToString(),font,Brushes.White,new RectangleF(0,0,32,32),format);
            IntPtr handle=bitmap.GetHicon();
            try { using(var tmp=Icon.FromHandle(handle))return (Icon)tmp.Clone(); }
            finally { DestroyIcon(handle); }
        }
    }
    static bool ApplyTaskbarOverlay(IntPtr hwnd,Icon icon,int count) {
        object taskbar=null;
        IntPtr face=IntPtr.Zero,unknown=IntPtr.Zero;
        try {
            taskbar=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("56FDF344-FD6D-11D0-958A-006097C9A090")));
            unknown=Marshal.GetIUnknownForObject(taskbar);
            var iid=new Guid("EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF");
            if(Marshal.QueryInterface(unknown,ref iid,out face)!=0)return false;
            var table=Marshal.ReadIntPtr(face);
            var init=(TaskbarInit)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(table,3*IntPtr.Size),typeof(TaskbarInit));
            if(init(face)<0)return false;
            var set=(SetOverlay)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(table,OverlaySlot*IntPtr.Size),typeof(SetOverlay));
            return set(face,hwnd,icon==null?IntPtr.Zero:icon.Handle,count+" unread notifications")>=0;
        } catch(COMException) { return false; }
        finally {
            if(face!=IntPtr.Zero)Marshal.Release(face);
            if(unknown!=IntPtr.Zero)Marshal.Release(unknown);
            if(taskbar!=null)Marshal.ReleaseComObject(taskbar);
        }
    }
    void SetBadge(int value) {
        unread=Math.Max(0,Math.Min(100,value));
        var prev=badgeIcon;badgeIcon=CreateBadgeIcon(unread);
        tray.Icon=badgeIcon ?? Icon;
        tray.Text=unread>0?"Monexus · "+unread+" unread":"Monexus Workspace";
        ApplyTaskbarOverlay(Handle,badgeIcon,unread);
        if(prev!=null)prev.Dispose();
    }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern int SetCurrentProcessExplicitAppUserModelID(string id);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();

    [STAThread] static void Main() {
        SetProcessDPIAware();
        SetCurrentProcessExplicitAppUserModelID(AppId);
        bool first;
        using(var signal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Monexus.Workspace.Show", out first)) {
            if(!first) { signal.Set(); return; }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new WorkspaceWindow(signal));
        }
    }
    WorkspaceWindow(EventWaitHandle signal) {
        showEvent=signal;Text="Monexus Workspace " + BuildVersion.Value;MinimumSize=new Size(880,600);
        var screen=Screen.PrimaryScreen.WorkingArea;Width=Math.Min(1440,screen.Width);Height=Math.Min(900,screen.Height);
        StartPosition=FormStartPosition.CenterScreen;Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        view.Dock=DockStyle.Fill;Controls.Add(view);
        var menu=new ContextMenuStrip();menu.Items.Add("Open Monexus Workspace",null,delegate { RestoreWorkspace(); });menu.Items.Add("Quit Monexus Workspace",null,delegate { quitting=true;Close(); });
        tray.Text=Text;tray.Icon=Icon;tray.ContextMenuStrip=menu;tray.Visible=true;
        tray.MouseClick+=(s,e)=>{if(e.Button==MouseButtons.Left)RestoreWorkspace();};
        Shown+=StartWebView;
        FormClosing+=(s,e)=>{if(!quitting&&e.CloseReason==CloseReason.UserClosing){e.Cancel=true;Hide();}};
        FormClosed+=(s,e)=>{if(showWait!=null)showWait.Unregister(null);tray.Visible=false;tray.Dispose();};
    }
    void RestoreWorkspace(){Show();if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Activate();}
    static void ConfigureView(CoreWebView2 core) {
        core.Settings.AreDevToolsEnabled=false;
        core.Settings.AreHostObjectsAllowed=false;
        core.Settings.IsStatusBarEnabled=false;
        core.SetVirtualHostNameToFolderMapping("workspace.monexus.local",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web"),CoreWebView2HostResourceAccessKind.DenyCors);
        core.NavigationStarting+=(s,e)=>{if(!Local(e.Uri))e.Cancel=true;};
        core.NewWindowRequested+=(s,e)=>{e.Handled=true;if(e.IsUserInitiated && !Local(e.Uri))OpenWeb(e.Uri);};
    }
    async void OpenWorkspaceWindow(CoreWebView2Environment env,string address,string title) {
        if(!Local(address) || new Uri(address).AbsolutePath!="/index.html")return;
        bool isCall=new Uri(address).Query.StartsWith("?window=meetings&room=",StringComparison.Ordinal);
        Form existing;
        if(isCall && callWindows.TryGetValue(address,out existing) && !existing.IsDisposed) {
            if(existing.WindowState==FormWindowState.Minimized)existing.WindowState=FormWindowState.Normal;
            existing.Activate();return;
        }
        var child=new Form { Text=title+" · Monexus",Icon=Icon,Size=new Size(960,720),
            MinimumSize=new Size(420,360),StartPosition=FormStartPosition.CenterParent };
        if(isCall)callWindows[address]=child;
        child.FormClosed+=(s,e)=>{if(isCall)callWindows.Remove(address);};
        var content=new WebView2 { Dock=DockStyle.Fill };
        child.Controls.Add(content);
        bool activeCall=false,allowClose=false;
        PresenterControls controls=null;
        Action dismissControls=()=>{if(controls!=null){controls.Dispose();controls=null;}};
        child.FormClosed+=(s,e)=>dismissControls();
        child.FormClosing+=(s,e)=>{
            if(!isCall || allowClose || e.CloseReason!=CloseReason.UserClosing)return;
            if(activeCall && content.CoreWebView2!=null) {
                e.Cancel=true;
                content.CoreWebView2.PostWebMessageAsJson("{\"kind\":\"close_call\"}");
            } else {
                e.Cancel=MessageBox.Show(child,"Close this meeting window?","Monexus Workspace",
                    MessageBoxButtons.YesNo,MessageBoxIcon.Question,MessageBoxDefaultButton.Button2)!=DialogResult.Yes;
            }
        };
        child.Show();
        try {
            await content.EnsureCoreWebView2Async(env);
            if(child.IsDisposed)return;
            var core=content.CoreWebView2;
            ConfigureView(core);
            Action reportPin=()=>core.PostWebMessageAsJson(child.TopMost ?
                "{\"kind\":\"pin_state\",\"pinned\":true}" : "{\"kind\":\"pin_state\",\"pinned\":false}");
            core.ProcessFailed+=(s,e)=>{if(e.ProcessFailedKind==CoreWebView2ProcessFailedKind.RenderProcessExited){activeCall=false;dismissControls();}};
            core.WebMessageReceived+=(s,e)=>{
                if(!Local(e.Source))return;
                try {
                    var message=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);
                    switch(Convert.ToString(message["command"])) {
                        case "open_link":OpenWeb(Convert.ToString(message["url"]));break;
                        case "open_window":OpenWorkspaceWindow(env,Convert.ToString(message["url"]),Convert.ToString(message["title"]));break;
                        case "toggle_pin":child.TopMost=!child.TopMost;reportPin();break;
                        case "get_pin":reportPin();break;
                        case "call_active":activeCall=isCall && Convert.ToBoolean(message["active"]);if(!activeCall)dismissControls();break;
                        case "share_controls":
                            if(!activeCall || !Convert.ToBoolean(message["sharing"])){dismissControls();break;}
                            if(controls==null) {
                                controls=new PresenterControls(child,action=>{
                                    if(action=="meeting" || action=="settings" || action=="end"){
                                        if(child.WindowState==FormWindowState.Minimized)child.WindowState=FormWindowState.Normal;
                                        child.Activate();
                                    }
                                    core.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(new {kind="share_control",action}));
                                });
                                controls.Show();
                            }
                            controls.UpdateAudio(Convert.ToBoolean(message["mic"]),Convert.ToBoolean(message["busy"]));break;
                        case "close_window":allowClose=true;child.Close();break;
                    }
                } catch(Exception) { if(!child.IsDisposed)core.PostWebMessageAsString("Windows could not complete the window action."); }
            };
            core.Navigate(address);
        } catch(Exception ex) {
            if(!child.IsDisposed){MessageBox.Show(child,ex.Message,"Unable to open workspace window");child.Close();}
        }
    }
    async void StartWebView(object sender,EventArgs args) {
        showWait=ThreadPool.RegisterWaitForSingleObject(showEvent,(o,t)=>{if(!IsDisposed)BeginInvoke(new Action(RestoreWorkspace));},null,Timeout.Infinite,false);
        try {
            if(String.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER")))InstallPaths.EnsureRoot();
            string profile=InstallPaths.Profile;
            var env=await CoreWebView2Environment.CreateAsync(null,profile,null);
            await view.EnsureCoreWebView2Async(env);var core=view.CoreWebView2;
            ConfigureView(core);
            try { await core.Profile.SetPermissionStateAsync(CoreWebView2PermissionKind.Autoplay,Origin,CoreWebView2PermissionState.Allow); }
            catch (NotImplementedException) { /* Older runtimes use the shared audio button. */ }
            catch (COMException) { /* Device policy can manage playback permissions. */ }
            var meetingAlarm = new System.Windows.Forms.Timer();
            meetingAlarm.Tick += (s,e) => {meetingAlarm.Stop();core.PostWebMessageAsJson("{\"kind\":\"meeting_clock\"}");};
            FormClosed += (s,e) => meetingAlarm.Dispose();
            core.WebMessageReceived+=(s,e)=>{
                if(!Local(e.Source))return;
                try {
                    var msg=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);
                    string command=Convert.ToString(msg["command"]);
                    if(command=="open_window")OpenWorkspaceWindow(env,Convert.ToString(msg["url"]),Convert.ToString(msg["title"]));
                    if(command=="unread_badge")SetBadge(Convert.ToInt32(msg["count"]));
                    if(command=="meeting_alarm"){
                        meetingAlarm.Stop();
                        double delay=Convert.ToDouble(msg["delay"]);
                        if(delay>0){meetingAlarm.Interval=(int)Math.Min(Int32.MaxValue,Math.Ceiling(delay));meetingAlarm.Start();}
                    }
                    if(command=="update"){
                        string setup=Path.Combine(InstallPaths.Root,"MonexusSetup.exe");
                        if(File.Exists(setup))InstallPaths.StartInstalledExecutable(setup,"/update");
                        else MessageBox.Show(this,"Run the Monexus Workspace installer to enable updates.");
                    }
                    if(command=="open_link")OpenWeb(Convert.ToString(msg["url"]));
                    if(command=="minimize")WindowState=FormWindowState.Minimized;
                    if(command=="tray")Hide();
                    if(command=="restore")RestoreWorkspace();
                    if(command=="window_state")core.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(new {kind="window_state",visible=Visible,minimized=WindowState==FormWindowState.Minimized}));
                    if(command=="deliver_notification"){
                        bool sound=Convert.ToBoolean(msg["sound"]),banner=Convert.ToBoolean(msg["banner"]);
                        string title=Convert.ToString(msg["title"]),body=Convert.ToString(msg["body"]);
                        if(banner && (!Visible || WindowState==FormWindowState.Minimized || GetForegroundWindow()!=Handle)){
                            try { Banner(title,body,sound); core.PostWebMessageAsJson("{\"kind\":\"notification_delivery\",\"method\":\"windows\",\"accepted\":true}"); }
                            catch (Exception error) {
                                core.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(new {kind="notification_delivery",method="windows",accepted=false,hresult=error.HResult}));
                                throw;
                            }
                        }
                        else {
                            if(banner && !(msg.ContainsKey("foregroundHandled") && Convert.ToBoolean(msg["foregroundHandled"])))
                                core.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(new {kind="workspace_banner",title,body}));
                            if(sound)System.Media.SystemSounds.Asterisk.Play();
                            core.PostWebMessageAsJson("{\"kind\":\"notification_delivery\",\"method\":\"in-app\",\"accepted\":true}");
                        }
                    }
                    if(command=="quit"){quitting=true;Close();}
                } catch(Exception){core.PostWebMessageAsString("Windows could not complete the desktop action.");}
            };
            core.Navigate(Origin+"/index.html");
        } catch(Exception e) { MessageBox.Show("Monexus needs the Microsoft Edge WebView2 Evergreen Runtime.\n\n"+e.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);quitting=true;Close(); }
    }
    static bool Local(string address){Uri u;return Uri.TryCreate(address,UriKind.Absolute,out u)&&u.GetLeftPart(UriPartial.Authority)==Origin;}
    static void OpenWeb(string address){Uri u;if(Uri.TryCreate(address,UriKind.Absolute,out u)&&(u.Scheme=="https"||u.Scheme=="http")&&String.IsNullOrEmpty(u.UserInfo))Process.Start(new ProcessStartInfo(u.AbsoluteUri){UseShellExecute=true});}
    static void Banner(string title,string body,bool sound){
        var xml=new XmlDocument();
        xml.LoadXml("<toast activationType=\"protocol\" launch=\"monexus-workspace:open\"><visual><binding template=\"ToastGeneric\"><text/><text/></binding></visual>"+(sound?"":"<audio silent=\"true\"/>")+"</toast>");
        var nodes=xml.GetElementsByTagName("text");nodes[0].InnerText=title;nodes[1].InnerText=body;
        ToastNotificationManager.CreateToastNotifier(AppId).Show(new ToastNotification(xml));
    }
}
