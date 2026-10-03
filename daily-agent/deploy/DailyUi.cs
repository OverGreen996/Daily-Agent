using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DailyUi {
  public static class AndroidDownload {
    public const string Url = "https://github.com/OverGreen996/Daily-Agent/releases/download/android-preview-10/DailyPet-Android.apk";
    public static void Show(IWin32Window owner, Image qr) {
      using(var form=new Form{Text="Daily Agent｜手機安裝",ClientSize=new Size(460,430),StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false}) {
        Theme.Apply(form);
        var title=new Label{Left=24,Top=18,Width=412,Height=30,ForeColor=Theme.Text,Text="手機掃碼，下載 Android 桌寵",Font=new Font("Microsoft JhengHei UI",14,FontStyle.Bold)};
        if(qr!=null) {
          var enlarged=new Bitmap(qr.Width*2,qr.Height*2);
          using(var g=Graphics.FromImage(enlarged)){g.InterpolationMode=InterpolationMode.NearestNeighbor;g.PixelOffsetMode=PixelOffsetMode.Half;g.DrawImage(qr,new Rectangle(0,0,enlarged.Width,enlarged.Height));}
          var picture=new PictureBox{Left=(460-enlarged.Width)/2,Top=58,Width=enlarged.Width,Height=enlarged.Height,Image=enlarged,SizeMode=PictureBoxSizeMode.CenterImage};
          form.Controls.Add(picture);form.FormClosed+=(s,e)=>enlarged.Dispose();
        }
        var note=new Label{Left=24,Top=357,Width=412,Height=25,ForeColor=Theme.Muted,Text="下載後依 Android 提示安裝，再與電腦配對。"};
        var open=new ActionButton{Left=24,Top=388,Width=200,Height=32,Primary=true,Text="開啟 GitHub 下載"};
        var copy=new ActionButton{Left=236,Top=388,Width=200,Height=32,Text="複製下載網址"};
        open.Click+=(s,e)=>System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Url){UseShellExecute=true});
        copy.Click+=(s,e)=>{Clipboard.SetText(Url);copy.Text="網址已複製";};
        form.Controls.AddRange(new Control[]{title,note,open,copy});form.ShowDialog(owner);
      }
    }
  }
  public static class Theme {
    public static readonly Color Background = Color.FromArgb(17, 21, 29);
    public static readonly Color Surface = Color.FromArgb(25, 31, 42);
    public static readonly Color Raised = Color.FromArgb(32, 40, 54);
    public static readonly Color Border = Color.FromArgb(46, 57, 75);
    public static readonly Color Text = Color.FromArgb(237, 242, 250);
    public static readonly Color Muted = Color.FromArgb(156, 171, 193);
    public static readonly Color Accent = Color.FromArgb(116, 156, 255);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);
    public static void Apply(Form form) {
      form.BackColor = Background; form.ForeColor = Text;
      form.Font = new Font("Microsoft JhengHei UI", 9.5f);
      form.AutoScaleMode = AutoScaleMode.Dpi;
      form.HandleCreated += delegate { try { int enabled = 1; DwmSetWindowAttribute(form.Handle, 20, ref enabled, 4); } catch { } };
    }
    public static GraphicsPath Shape(Rectangle bounds, int radius) {
      var path = new GraphicsPath(); int d = radius * 2;
      path.AddArc(bounds.Left, bounds.Top, d, d, 180, 90);
      path.AddArc(bounds.Right - d, bounds.Top, d, d, 270, 90);
      path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
      path.AddArc(bounds.Left, bounds.Bottom - d, d, d, 90, 90);
      path.CloseFigure(); return path;
    }
  }
  public class ActionButton : Button {
    public bool Primary { get; set; }
    public bool Selected { get; set; }
    public bool Navigation { get; set; }
    bool hover;
    public ActionButton() {
      SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
      FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0;
      BackColor = Theme.Raised; ForeColor = Theme.Text; Cursor = Cursors.Hand;
    }
    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnPaint(PaintEventArgs e) {
      e.Graphics.Clear(Parent == null ? Theme.Background : Parent.BackColor);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      Color fill = Primary ? Theme.Accent : Selected ? Color.FromArgb(37, 56, 88) : Navigation ? Theme.Background : Theme.Raised;
      if (hover && Enabled) fill = Primary ? Color.FromArgb(140, 174, 255) : Color.FromArgb(43, 54, 72);
      using (var shape = Theme.Shape(new Rectangle(1, 1, Width - 3, Height - 3), 8))
      using (var brush = new SolidBrush(fill)) {
        e.Graphics.FillPath(brush, shape);
        if (!Navigation && !Primary) using (var pen = new Pen(Theme.Border)) e.Graphics.DrawPath(pen, shape);
        if (Focused && ShowFocusCues) using (var pen = new Pen(Theme.Accent, 2)) e.Graphics.DrawPath(pen, shape);
      }
      var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix;
      flags |= Navigation ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter;
      Color ink = !Enabled ? Theme.Muted : Primary ? Theme.Background : Selected ? Theme.Accent : Theme.Text;
      TextRenderer.DrawText(e.Graphics, Text, Font, new Rectangle(Navigation ? 16 : 8, 0, Width - 24, Height), ink, flags);
    }
  }
  public class Card : Panel {
    public Card() { DoubleBuffered = true; BackColor = Theme.Surface; }
    protected override void OnPaint(PaintEventArgs e) {
      e.Graphics.Clear(Parent == null ? Theme.Background : Parent.BackColor);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (var shape = Theme.Shape(new Rectangle(1, 1, Width - 3, Height - 3), 12))
      using (var brush = new SolidBrush(Theme.Surface))
      using (var pen = new Pen(Theme.Border)) { e.Graphics.FillPath(brush, shape); e.Graphics.DrawPath(pen, shape); }
      base.OnPaint(e);
    }
  }
  // Navigation is rendered as accessible buttons outside the content container.
  // Keep TabControl selection and keyboard page switching for the existing flow.
  public class Pages : TabControl {
    public Pages() { Appearance = TabAppearance.FlatButtons; SizeMode = TabSizeMode.Fixed; ItemSize = new Size(1, 1); }
    protected override void WndProc(ref Message message) {
      if (message.Msg == 0x1328) { message.Result = IntPtr.Zero; return; }
      base.WndProc(ref message);
    }
  }
}
