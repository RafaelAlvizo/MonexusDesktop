using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;

internal static class InstallPaths {
    static readonly SecurityIdentifier User = WindowsIdentity.GetCurrent().User;
    static readonly string Base = @"D:\Monexus";
    internal static readonly string Root = Path.Combine(Base, User.Value);
    internal static readonly string Profile = Path.Combine(Root,"WebView");
    internal static string EnsureRoot() {
        if (!Directory.Exists(@"D:\")) throw new IOException("Monexus needs a writable D: drive.");
        Directory.CreateDirectory(Base);
        CheckOrdinary(Base);
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
