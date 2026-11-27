using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// Independent from the meeting form so the presenter can work in another app.
internal sealed class PresenterControls : Form {
    [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam);
    readonly Button microphone, stop;
    readonly ToolTip tips = new ToolTip();
    readonly Font symbols = new Font("Segoe MDL2 Assets", 13);
    readonly Font labels = new Font("Segoe UI", 9);
    readonly Font statusFont = new Font("Segoe UI", 9, FontStyle.Bold);
    protected override bool ShowWithoutActivation { get { return true; } }
    internal PresenterControls(Form meeting, Action<string> act) {
        Text="Screen sharing controls"; FormBorderStyle=FormBorderStyle.None;
        StartPosition=FormStartPosition.Manual; TopMost=true; ShowInTaskbar=false;
        AutoScaleMode=AutoScaleMode.Dpi; AutoScaleDimensions=new SizeF(96,96);
        BackColor=Color.FromArgb(27,30,33); ForeColor=Color.White; Font=labels;
        var buttons=new FlowLayoutPanel { Dock=DockStyle.Top, Height=45, WrapContents=false, Padding=new Padding(5,4,5,2) };
        microphone=Add(buttons,"Mute","\uE720",()=>act("mic"));
        Add(buttons,"Meeting","\uE8B2",()=>act("meeting"));
        Add(buttons,"Settings","\uE713",()=>act("settings"));
        Add(buttons,"End / leave","\uE137",()=>act("end"));
        var strip=new Panel {Dock=DockStyle.Bottom,Height=26,BackColor=Color.FromArgb(125,216,159)};
        var status=new Label { Text="⠿   You are sharing your screen",Dock=DockStyle.Fill,ForeColor=Color.FromArgb(18,42,31),
            TextAlign=ContentAlignment.MiddleCenter,Cursor=Cursors.SizeAll,Font=statusFont };
        tips.SetToolTip(status,"Drag sharing controls");
        status.MouseDown+=(s,e)=>{if(e.Button==MouseButtons.Left){ReleaseCapture();SendMessage(Handle,0xA1,new IntPtr(2),IntPtr.Zero);}};
        stop=new Button {Text="Stop sharing",Dock=DockStyle.Right,Width=110,ForeColor=Color.White,BackColor=Color.FromArgb(169,48,63),
            FlatStyle=FlatStyle.Flat,Font=statusFont,Cursor=Cursors.Hand};
        stop.FlatAppearance.BorderSize=0; stop.Click+=(s,e)=>act("stop");
        strip.Controls.Add(status);strip.Controls.Add(stop);
        ClientSize=new Size(398,71);Controls.Add(buttons);Controls.Add(strip);
        Shown+=(s,e)=>{var area=Screen.FromControl(meeting).WorkingArea;Location=new Point(area.Left+(area.Width-Width)/2,area.Top+8);
            SetWindowDisplayAffinity(Handle,0x11);};
    }
    Button Add(FlowLayoutPanel row,string name,string glyph,Action action) {
        var icon=new Bitmap(23,23);
        using(var g=Graphics.FromImage(icon))TextRenderer.DrawText(g,glyph,symbols,new Rectangle(0,0,23,23),Color.White,
            TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
        var button=new Button {Text=name,Image=icon,TextImageRelation=TextImageRelation.ImageBeforeText,
            AccessibleName=name,Font=labels,FlatStyle=FlatStyle.Flat,ForeColor=Color.White,
            Width=94,Height=35,Margin=new Padding(1,0,1,0),Cursor=Cursors.Hand};
        button.FlatAppearance.BorderSize=0;button.FlatAppearance.MouseOverBackColor=Color.FromArgb(53,58,62);
        button.Click+=(s,e)=>action();button.Disposed+=(s,e)=>icon.Dispose();tips.SetToolTip(button,name);row.Controls.Add(button);return button;
    }
    internal void UpdateAudio(bool on,bool busy) {
        microphone.AccessibleName=on?"Mute microphone":"Unmute microphone";
        tips.SetToolTip(microphone,microphone.AccessibleName);
        microphone.ForeColor=on?Color.White:Color.LightCoral;
        microphone.Text=on?"Mute":"Unmute";microphone.Enabled=stop.Enabled=!busy;
    }
    protected override void Dispose(bool disposing) {
        base.Dispose(disposing);
        if(disposing){tips.Dispose();symbols.Dispose();labels.Dispose();statusFont.Dispose();}
    }
}
