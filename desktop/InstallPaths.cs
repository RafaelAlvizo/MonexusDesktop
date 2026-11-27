using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32;

internal static class InstallPaths {
    static readonly SecurityIdentifier User = WindowsIdentity.GetCurrent().User;
    internal const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MonexusWorkspace";
    static readonly string Local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    internal static readonly string LocalRoot = Path.Combine(Local, "Programs", "Monexus Workspace");
    internal static readonly string LocalData = Path.Combine(Local, "Monexus");
    internal static readonly string Root = FindRoot();
    internal static readonly string Profile = Path.Combine(Root == LocalRoot ? LocalData : Root, "WebView");

    static string FindRoot() {
        using (var key = Registry.CurrentUser.OpenSubKey(UninstallKey)) {
            var registered = key == null ? null : key.GetValue("InstallLocation") as string;
            var priorRoot = Path.Combine(@"D:\Monexus", User.Value);
            if (String.Equals(registered, priorRoot, StringComparison.OrdinalIgnoreCase) && Directory.Exists(priorRoot))
                return priorRoot;
        }
        return LocalRoot;
    }

    internal static string EnsureRoot() {
        if (Root == LocalRoot) {
            Directory.CreateDirectory(Root);
            CheckOrdinary(Root);
            return Root;
        }
        CheckOrdinary(Path.GetDirectoryName(Root));
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true,false);
        security.SetOwner(User);
        foreach (var sid in new [] { User, new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null),
                new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid,null) })
            security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        Directory.CreateDirectory(Root,security);
        CheckOrdinary(Root);
        if (!User.Equals(Directory.GetAccessControl(Root).GetOwner(typeof(SecurityIdentifier))))
            throw new IOException("This Monexus folder belongs to another Windows account.");
        return Root;
    }
    internal static void CheckOrdinary(string path) {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Monexus cannot migrate a linked folder or file: "+path);
    }
}
