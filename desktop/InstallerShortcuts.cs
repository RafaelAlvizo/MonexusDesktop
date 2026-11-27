using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

internal static class InstallerShortcuts {
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink {}

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW {
        void GetPath(StringBuilder file, int length, IntPtr findData, uint flags);
        void GetIDList(out IntPtr id);
        void SetIDList(IntPtr id);
        void GetDescription(StringBuilder text, int length);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetWorkingDirectory(StringBuilder path, int length);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
        void GetArguments(StringBuilder args, int length);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
        void GetHotkey(out ushort key);
        void SetHotkey(ushort key);
        void GetShowCmd(out int command);
        void SetShowCmd(int command);
        void GetIconLocation(StringBuilder path, int length, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }

    [StructLayout(LayoutKind.Sequential, Pack=4)]
    private struct PropertyKey { public Guid format; public uint id; }
    [StructLayout(LayoutKind.Explicit, Size=24)]
    private struct Variant { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr value; }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out Variant value);
        void SetValue(ref PropertyKey key, ref Variant value);
        void Commit();
    }

    private static void SetNotificationIdentity(IPropertyStore store, string appId) {
        var key = new PropertyKey { format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), id = 5 };
        var value = new Variant { type = 31, value = Marshal.StringToCoTaskMemUni(appId) };
        try { store.SetValue(ref key, ref value); }
        finally { Marshal.FreeCoTaskMem(value.value); }
        key.id = 26;
        value = new Variant { type = 72, value = Marshal.AllocCoTaskMem(16) };
        try {
            Marshal.StructureToPtr(new Guid("DC295354-75BA-4CEC-849B-1768E030278B"), value.value, false);
            store.SetValue(ref key, ref value);
        } finally { Marshal.FreeCoTaskMem(value.value); }
        store.Commit();
    }

    internal static string PathFor(Environment.SpecialFolder folder, string name) {
        string directory = Environment.GetFolderPath(folder, Environment.SpecialFolderOption.DoNotVerify);
        return Path.IsPathRooted(directory) ? Path.Combine(directory, name) : null;
    }

    internal static bool IsMonexusLink(string path, string root) {
        object link = null;
        try {
            link = new ShellLink();
            ((IPersistFile)link).Load(path, 0);
            var target = new StringBuilder(32768);
            ((IShellLinkW)link).GetPath(target, target.Capacity, IntPtr.Zero, 4);
            string file = target.ToString();
            if (String.Equals(file,Path.Combine(root,"MonexusSetup.exe"),StringComparison.OrdinalIgnoreCase)) return true;
            string parent=Path.GetDirectoryName(file);
            return !String.IsNullOrEmpty(parent) && String.Equals(Path.GetFileName(file),"Monexus.exe",StringComparison.OrdinalIgnoreCase)
                && String.Equals(Path.GetDirectoryName(parent),root,StringComparison.OrdinalIgnoreCase)
                && System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(parent),@"^app-\d+\.\d+\.\d+$");
        } catch (COMException) { return false; }
        catch (IOException) { return false; } catch (UnauthorizedAccessException) { return false; }
        finally { if (link != null) Marshal.ReleaseComObject(link); }
    }

    internal static bool TryCreate(string path, string target, string arguments, string description, string appId) {
        if (path == null) return false;
        object link = null;
        try {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            link = new ShellLink();
            var shortcut = (IShellLinkW)link;
            shortcut.SetPath(target);
            shortcut.SetWorkingDirectory(Path.GetDirectoryName(target));
            shortcut.SetArguments(arguments);
            shortcut.SetIconLocation(target, 0);
            shortcut.SetDescription(description);
            var properties = link as IPropertyStore;
            if (appId != null && properties != null) {
                try { SetNotificationIdentity(properties, appId); }
                catch (COMException ex) { Console.Error.WriteLine("Shortcut notification settings: " + ex.Message); }
            }
            ((IPersistFile)link).Save(path, true);
            return true;
        } catch (COMException ex) { Console.Error.WriteLine(ex.Message); }
          catch (IOException ex) { Console.Error.WriteLine(ex.Message); }
          catch (UnauthorizedAccessException ex) { Console.Error.WriteLine(ex.Message); }
        finally { if (link != null) Marshal.ReleaseComObject(link); }
        return false;
    }
}
