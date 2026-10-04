using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Globalization;
using System.Web.Script.Serialization;

namespace DailyPet {
  static class Json {
    public static string Encode(object value) { return new JavaScriptSerializer { MaxJsonLength=9000000 }.Serialize(value); }
    public static Dictionary<string, object> Decode(string text) { return new JavaScriptSerializer {MaxJsonLength=20000000}.Deserialize<Dictionary<string, object>>(text); }
    public static string Text(Dictionary<string, object> d, string key) { return d.ContainsKey(key) && d[key] != null ? Convert.ToString(d[key]) : ""; }
  }
  static class SpeechChunker {
    static bool Strong(char c){return c=='。'||c=='！'||c=='？'||c=='!'||c=='?'||c=='\n';}
    static bool Soft(char c){return c=='，'||c==','||c=='；'||c==';'||c=='：'||c==':';}
    public static List<string> Push(ref string pending,string addition,bool final){
      pending+=(addition??"");var result=new List<string>();
      while(pending.Length>0){int cut=-1;for(int i=0;i<pending.Length;i++)if(Strong(pending[i])){cut=i+1;break;}
        if(cut<0&&pending.Length>=60){for(int i=Math.Min(pending.Length-1,59);i>=24;i--)if(Soft(pending[i])){cut=i+1;break;}}
        if(cut<0)break;string part=pending.Substring(0,cut).Trim();pending=pending.Substring(cut);if(part.Length>0)result.Add(part);
      }
      if(final&&pending.Trim().Length>0){result.Add(pending.Trim());pending="";}return result;
    }
  }
  class Api : IDisposable {
    readonly HttpClient http = new HttpClient(new HttpClientHandler { UseProxy = false });
    readonly HttpClient stream = new HttpClient(new HttpClientHandler { UseProxy = false });
    readonly CancellationTokenSource stop = new CancellationTokenSource();
    readonly string url; string token;
    public bool Listening { get; private set; }
    public void OpenPocketDrop(){System.Diagnostics.Process.Start(url+"/pocketdrop");}
    public void OpenPalace(){System.Diagnostics.Process.Start(url+"/palace");}
    public Api(string baseUrl) {
      Uri parsed = new Uri(baseUrl);
      if (parsed.Host != "127.0.0.1" || parsed.Scheme != "http") throw new ArgumentException("Only localhost is allowed");
      url = baseUrl.TrimEnd('/'); http.Timeout = TimeSpan.FromMinutes(20); stream.Timeout = Timeout.InfiniteTimeSpan;
    }
    public async Task Connect() {
      string html = await http.GetStringAsync(url + "/");
      Match m = Regex.Match(html, "name=\"daily-token\" content=\"([a-f0-9]+)\"");
      if (!m.Success) throw new Exception("後端尚未就緒"); token = m.Groups[1].Value;
    }
    public async Task<Dictionary<string, object>> Call(string path, object body) {
      if (token == null) await Connect();
      using (var req = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, url + "/api/" + path)) {
        req.Headers.Add("x-daily-token", token);
        if (body != null) req.Content = new StringContent(Json.Encode(body), Encoding.UTF8, "application/json");
        using (var response = await http.SendAsync(req, stop.Token)) {
          string text = await response.Content.ReadAsStringAsync();
          if ((int)response.StatusCode == 401) { await Connect(); throw new Exception("連線已更新，請再說一次。"); }
          var data = Json.Decode(text);
          if (!response.IsSuccessStatusCode) throw new Exception(Json.Text(data, "error"));
          return data;
        }
      }
    }
    public async Task<List<Dictionary<string,object>>> History() {
      if(token==null) await Connect();
      using(var req=new HttpRequestMessage(HttpMethod.Get,url+"/api/history")) {
        req.Headers.Add("x-daily-token",token);
        using(var response=await http.SendAsync(req,stop.Token)) {
          response.EnsureSuccessStatusCode();
          return new JavaScriptSerializer {MaxJsonLength=9000000}.Deserialize<List<Dictionary<string,object>>>(await response.Content.ReadAsStringAsync());
        }
      }
    }
    public async Task Listen(Action<Dictionary<string, object>> received) {
      while (!stop.IsCancellationRequested) {
        try {
          await Connect();
          using (var req = new HttpRequestMessage(HttpMethod.Get, url + "/api/events")) {
            req.Headers.Add("x-daily-token", token);
            using (var response = await stream.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, stop.Token)) {
              response.EnsureSuccessStatusCode();
              Listening=true;
              using (var reader = new StreamReader(await response.Content.ReadAsStreamAsync(), Encoding.UTF8)) {
                while (!stop.IsCancellationRequested) {
                  string line = await reader.ReadLineAsync(); if (line == null) break;
                  if (line.StartsWith("data: ")) received(Json.Decode(line.Substring(6)));
                }
              }
            }
          }
        } catch (Exception) { if (stop.IsCancellationRequested) break; }
        finally { Listening=false; }
        try { await Task.Delay(5000, stop.Token); } catch (TaskCanceledException) { break; }
      }
    }
    public void Dispose() { stop.Cancel(); http.Dispose(); stream.Dispose(); stop.Dispose(); }
  }
  static class Native {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; public Point(int x, int y) { X=x; Y=y; } }
    [StructLayout(LayoutKind.Sequential)] public struct Size { public int Width, Height; public Size(int w, int h) { Width=w; Height=h; } }
    [StructLayout(LayoutKind.Sequential, Pack=1)] public struct Blend { public byte Op, Flags, Alpha, Format; }
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool UpdateLayeredWindow(IntPtr h, IntPtr dst, ref Point pos, ref Size size, IntPtr src, ref Point origin, int color, ref Blend blend, int flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, string text);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr data);
  }
  sealed class ScrollableReply : Control, IMessageFilter {
    readonly VScrollBar scroll=new VScrollBar();
    int wheelRemainder,contentHeight;
    public ScrollableReply() { DoubleBuffered=true; Controls.Add(scroll); scroll.ValueChanged+=delegate { Invalidate(); }; Application.AddMessageFilter(this); }
    public override string Text { get { return base.Text; } set { SetContent(value,false); } }
    public void SetContent(string value,bool preserveScroll) { base.Text=value ?? ""; LayoutReply(); if(!preserveScroll) ScrollToTop(); }
    public int ScrollOffset { get { return scroll.Value; } }
    public int ContentHeight { get { return contentHeight; } }
    public int MeasureHeight(int width) { return TextRenderer.MeasureText(Text,Font,new System.Drawing.Size(Math.Max(1,width-SystemInformation.VerticalScrollBarWidth-2),Int32.MaxValue),TextFormatFlags.WordBreak|TextFormatFlags.TextBoxControl|TextFormatFlags.NoPrefix).Height+4; }
    protected override void OnResize(EventArgs e) { base.OnResize(e); LayoutReply(); }
    protected override void OnFontChanged(EventArgs e) { base.OnFontChanged(e); LayoutReply(); }
    void LayoutReply() {
      if(scroll==null || ClientSize.Width<1) return;
      contentHeight=MeasureHeight(ClientSize.Width);
      scroll.SetBounds(Math.Max(0,ClientSize.Width-scroll.Width),0,scroll.Width,ClientSize.Height);
      scroll.LargeChange=Math.Max(1,ClientSize.Height); scroll.SmallChange=Math.Max(1,Font.Height);
      scroll.Maximum=Math.Max(0,contentHeight-1); scroll.Visible=contentHeight>ClientSize.Height;
      scroll.Value=Math.Min(scroll.Value,Math.Max(0,contentHeight-ClientSize.Height)); Invalidate();
    }
    protected override void OnPaint(PaintEventArgs e) {
      TextRenderer.DrawText(e.Graphics,Text,Font,new Rectangle(0,-ScrollOffset,Math.Max(1,ClientSize.Width-SystemInformation.VerticalScrollBarWidth-2),Math.Max(ClientSize.Height,contentHeight)),ForeColor,TextFormatFlags.WordBreak|TextFormatFlags.TextBoxControl|TextFormatFlags.NoPrefix|TextFormatFlags.PreserveGraphicsClipping);
      base.OnPaint(e);
    }
    public void ScrollToTop() { scroll.Value=0; }
    public void ScrollToEnd() { scroll.Value=Math.Max(0,ContentHeight-ClientSize.Height); }
    public void Wheel(int delta) {
      wheelRemainder+=delta; int notches=wheelRemainder/120; wheelRemainder%=120;
      int lines=SystemInformation.MouseWheelScrollLines;
      int distance=lines<0 ? ClientSize.Height : Math.Max(1,lines)*Font.Height;
      scroll.Value=Math.Max(0,Math.Min(Math.Max(0,ContentHeight-ClientSize.Height),ScrollOffset-notches*distance));
    }
    protected override void WndProc(ref Message m) {
      if(m.Msg==0x20A) { Wheel(unchecked((short)((long)m.WParam>>16))); return; }
      base.WndProc(ref m);
    }
    public bool PreFilterMessage(ref Message m) {
      if(m.Msg!=0x20A || IsDisposed || !Visible || !IsHandleCreated || m.HWnd==Handle) return false;
      var source=Control.FromHandle(m.HWnd);
      if(source==null || source.FindForm()!=FindForm() || !ClientRectangle.Contains(PointToClient(Cursor.Position))) return false;
      // Keep the input caret where it is; route wheel input only while hovering the reply.
      Native.SendMessage(Handle,m.Msg,m.WParam,m.LParam); return true;
    }
    protected override void Dispose(bool disposing) { if(disposing) Application.RemoveMessageFilter(this); base.Dispose(disposing); }
    public void UseContextMenu(ContextMenuStrip menu) { ContextMenuStrip=menu; scroll.ContextMenuStrip=menu; }
    public void WireDrop(DragEventHandler enter,DragEventHandler drop) { scroll.AllowDrop=true; scroll.DragEnter+=enter; scroll.DragDrop+=drop; }
  }
  enum BubbleSide { Above, Left, Right, Below }
  class BubblePlacement {
    public Point Location; public BubbleSide Side;
    public static BubblePlacement Calculate(Rectangle pet, System.Drawing.Size size, Rectangle area) {
      const int gap=8;
      int head=pet.Top+pet.Height/5;
      int x=pet.Left+(pet.Width-size.Width)/2, y=pet.Top-size.Height-gap;
      BubbleSide side=BubbleSide.Above;
      if(y<area.Top) {
        y=head-size.Height/2;
        if(pet.Left-size.Width-gap>=area.Left) { side=BubbleSide.Left; x=pet.Left-size.Width-gap; }
        else if(pet.Right+size.Width+gap<=area.Right) { side=BubbleSide.Right; x=pet.Right+gap; }
        else { side=BubbleSide.Below; x=pet.Left+(pet.Width-size.Width)/2; y=pet.Bottom+gap; }
      }
      x=Math.Max(area.Left,Math.Min(x,area.Right-size.Width));
      y=Math.Max(area.Top,Math.Min(y,area.Bottom-size.Height));
      return new BubblePlacement { Location=new Point(x,y),Side=side };
    }
  }
  class Bubble : Form {
    static readonly string TextFontName=ChooseTextFont();
    static string ChooseTextFont() { try { using(var family=new FontFamily("Noto Sans TC"))return family.Name; } catch {return "Microsoft JhengHei UI";} }
    public static Font TextFont(float size,FontStyle style=FontStyle.Regular) {return new Font(TextFontName,size,style);}
    static readonly Color Paper=Color.FromArgb(255,253,249);
    static readonly Color Ink=Color.FromArgb(38,43,42);
    static readonly Color InputPaper=Color.FromArgb(246,242,237);
    static readonly Color Accent=Color.FromArgb(104,145,136);
    readonly Font nameFont=TextFont(9,FontStyle.Bold);
    string petName;
    readonly ScrollableReply answer = new ScrollableReply();
    readonly System.Windows.Forms.Timer typing=new System.Windows.Forms.Timer { Interval=32 };
    string revealText="";
    int[] revealBoundaries=new int[0];
    int revealedElements;
    public readonly ChatInput Input = new ChatInput();
    readonly PictureBox thumbnail=new PictureBox { SizeMode=PictureBoxSizeMode.Zoom };
    readonly Label attachmentLabel=new Label();
    public bool HasAttachment { get { return inputAttached; } }
    bool documentAttached,inputAttached,generatedPreview;
    public Action<string> Submitted;
    public Action GeneratedImageClicked;
    public Action MessageChanged;
    public Func<Rectangle> PetBounds;
    public bool Expanded;
    BubbleSide side=BubbleSide.Above; Point target; int tail=175;
    public Bubble(string displayName) {
      petName=displayName;
      typing.Tick+=delegate { RevealStep(); };
      VisibleChanged+=delegate { if(!Visible) FinishReveal(); };
      Text = petName+"對話"; FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true;
      StartPosition = FormStartPosition.Manual; BackColor = Paper; ForeColor=Ink;
      Font = TextFont(12); DoubleBuffered = true; Opacity=0.92;
      answer.BackColor = BackColor;
      answer.ForeColor = Ink; answer.Font = Font;
      answer.TabStop = false;
      answer.ContextMenuStrip = new ContextMenuStrip();
      answer.AccessibleName="完整回覆，可使用滑鼠滾輪捲動";
      Input.BorderStyle = BorderStyle.None; Input.BackColor = InputPaper; Input.Font = TextFont(11);
      Input.ForeColor=Ink;
      Input.AccessibleName = "和"+petName+"說話"; Input.Multiline = false; Input.MaxLength = 14000;
      Input.ContextMenuStrip = new ContextMenuStrip();
      Input.HandleCreated += delegate { Native.SendMessage(Input.Handle,0x1501,new IntPtr(1),"想聊點什麼？"); };
      Input.GotFocus+=delegate { Invalidate(); }; Input.LostFocus+=delegate { Invalidate(); };
      Input.KeyDown += delegate(object s, KeyEventArgs e) {
        if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; string text=Input.Text.Trim();
          if ((text.Length>0 || HasAttachment) && Submitted!=null) { Input.Clear(); Submitted(text.Length>0 ? text : documentAttached ? "請摘要這份文件。" : "請描述這張圖片。"); } }
      };
      thumbnail.BackColor=Paper; thumbnail.Visible=false;
      thumbnail.Cursor=Cursors.Hand;thumbnail.Click+=delegate{if(generatedPreview&&GeneratedImageClicked!=null)GeneratedImageClicked();};
      attachmentLabel.BackColor=Paper; attachmentLabel.ForeColor=Ink; attachmentLabel.Font=TextFont(9); attachmentLabel.AutoEllipsis=true; attachmentLabel.Visible=false;
      Controls.Add(answer); Controls.Add(Input); Controls.Add(thumbnail); Controls.Add(attachmentLabel); ResizeBubble(false);
    }
    public void SetPetName(string name) { petName=name; Text=name+"對話"; Input.AccessibleName="和"+name+"說話"; Invalidate(); }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams { get { var c=base.CreateParams; c.ExStyle |= 0x80; c.ClassStyle |= 0x20000; return c; } }
    public void ResizeBubble(bool expanded) {
      int extra=thumbnail.Image!=null ? 76 : 0;
      Rectangle pet=PetBounds==null ? new Rectangle(800,700,192,208) : PetBounds();
      Rectangle area=Screen.FromRectangle(pet).WorkingArea;
      Expanded=expanded;
      int width=Math.Min(expanded ? 540 : 368,Math.Max(160,area.Width-16));
      int minHeight=(expanded ? 480 : 260)+extra;
      int desired=Math.Max(minHeight,answer.MeasureHeight(width-64)+153+extra);
      // Prefer room over the pet's head. At the top edge use the available side.
      int above=pet.Top-area.Top-8;
      int limit=above>=minHeight ? above : area.Height-16;
      ClientSize=new System.Drawing.Size(width,Math.Min(desired,Math.Max(180,limit)));
      answer.SetBounds(32,66,ClientSize.Width-64,ClientSize.Height-153-extra);
      answer.Visible=true;
      Input.SetBounds(43,ClientSize.Height-61,ClientSize.Width-113,25);
      thumbnail.SetBounds(32,ClientSize.Height-145,80,58);
      attachmentLabel.SetBounds(124,ClientSize.Height-143,ClientSize.Width-156,58);
      UpdateShape();
    }
    public void SetAttachment(ChatImage image) {
      documentAttached=false;inputAttached=image!=null;generatedPreview=false;
      thumbnail.Image=image==null ? null : image.Preview;
      thumbnail.Visible=attachmentLabel.Visible=image!=null;
      attachmentLabel.Text=image==null ? "" : image.Width+" × "+image.Height+" · 待傳圖片\n輸入問題後按 Enter\n右鍵選單可移除，或說「移除圖片」";
      ResizeBubble(Expanded);
    }
    public void SetDocument(ChatDocument document) {
      documentAttached=document!=null;inputAttached=document!=null;generatedPreview=false;thumbnail.Image=document==null?null:document.Preview;
      thumbnail.Visible=attachmentLabel.Visible=document!=null;
      attachmentLabel.Text=document==null?"":document.Name+"\n"+Math.Ceiling(document.Bytes/1024.0)+" KB · 待傳文件\n按 Enter 摘要或輸入問題";
      ResizeBubble(Expanded);
    }
    public void SetGeneratedImage(ChatImage image) {
      documentAttached=false;inputAttached=false;generatedPreview=image!=null;thumbnail.Image=image==null?null:image.Preview;
      thumbnail.Visible=attachmentLabel.Visible=image!=null;
      attachmentLabel.Text=image==null?"":image.Width+" × "+image.Height+" · 已生成\n點圖片可開啟原圖";
      ResizeBubble(Expanded);
    }
    public void WireDrop(DragEventHandler enter,DragEventHandler drop) {
      AllowDrop=true; DragEnter+=enter; DragDrop+=drop;
      foreach(Control c in Controls) { c.AllowDrop=true; c.DragEnter+=enter; c.DragDrop+=drop; }
      answer.WireDrop(enter,drop);
    }
    public void PointAt(BubbleSide placement, Point head) {
      int next=(placement==BubbleSide.Above || placement==BubbleSide.Below) ? head.X-Left : head.Y-Top;
      int limit=(placement==BubbleSide.Above || placement==BubbleSide.Below) ? Width : Height;
      next=Math.Max(52,Math.Min(next,limit-52));
      if(side==placement && tail==next && target==head) return;
      side=placement; tail=next; target=head; UpdateShape();
    }
    void UpdateShape() {
      using (var p = Shape()) { var old=Region; Region=new Region(p); if(old!=null) old.Dispose(); }
      Invalidate();
    }
    public GraphicsPath Shape() {
      var p=new GraphicsPath(); int l=12,t=12,w=ClientSize.Width-13,h=ClientSize.Height-13,r=42;
      p.AddArc(l,t,r,r,180,90);
      if(side==BubbleSide.Below) { p.AddLine(tail-12,t,tail-12,t); p.AddBezier(tail-12,t,tail-6,t,tail-3,1,tail,1); p.AddBezier(tail,1,tail+3,1,tail+6,t,tail+12,t); }
      p.AddArc(w-r,t,r,r,270,90);
      if(side==BubbleSide.Left) { p.AddLine(w,tail-12,w,tail-12); p.AddBezier(w,tail-12,w,tail-6,w+11,tail-3,w+11,tail); p.AddBezier(w+11,tail,w+11,tail+3,w,tail+6,w,tail+12); }
      p.AddArc(w-r,h-r,r,r,0,90);
      if(side==BubbleSide.Above) { p.AddLine(tail+12,h,tail+12,h); p.AddBezier(tail+12,h,tail+6,h,tail+3,h+11,tail,h+11); p.AddBezier(tail,h+11,tail-3,h+11,tail-6,h,tail-12,h); }
      p.AddArc(l,h-r,r,r,90,90);
      if(side==BubbleSide.Right) { p.AddLine(l,tail+12,l,tail+12); p.AddBezier(l,tail+12,l,tail+6,1,tail+3,1,tail); p.AddBezier(1,tail,1,tail-3,l,tail-6,l,tail-12); }
      p.CloseFigure(); return p;
    }
    protected override void OnPaint(PaintEventArgs e) {
      e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;
      using(var p=Shape()) using(var pen=new Pen(Color.FromArgb(228,218,206),1)) e.Graphics.DrawPath(pen,p);
      // Small character signature, not a title bar or a status indicator.
      using(var brush=new SolidBrush(Accent)) {
        e.Graphics.FillPolygon(brush,new [] {new Point(36,33),new Point(39,39),new Point(45,42),new Point(39,45),new Point(36,51),new Point(33,45),new Point(27,42),new Point(33,39)});
      }
      TextRenderer.DrawText(e.Graphics,petName,nameFont,new Rectangle(51,32,ClientSize.Width-83,24),Ink,Paper,TextFormatFlags.NoPadding|TextFormatFlags.EndEllipsis|TextFormatFlags.SingleLine);
      using(var p=RoundedRect(new Rectangle(29,ClientSize.Height-72,ClientSize.Width-58,44),24)) {
        using(var brush=new SolidBrush(InputPaper)) e.Graphics.FillPath(brush,p);
        using(var pen=new Pen(Input.Focused ? Color.FromArgb(161,192,182) : Color.FromArgb(236,228,218),1)) e.Graphics.DrawPath(pen,p);
      }
      // Enter-key hint is painted decoration, not an extra send button.
      int x=ClientSize.Width-49,y=ClientSize.Height-55;
      using(var pen=new Pen(Input.Focused ? Accent : Color.FromArgb(169,157,144),1.4f)) {
        pen.StartCap=LineCap.Round; pen.EndCap=LineCap.Round; pen.LineJoin=LineJoin.Round;
        e.Graphics.DrawLines(pen,new [] {new Point(x,y-2),new Point(x,y+5),new Point(x-9,y+5)});
        e.Graphics.DrawLines(pen,new [] {new Point(x-5,y+1),new Point(x-9,y+5),new Point(x-5,y+9)});
      }
      base.OnPaint(e);
    }
    static GraphicsPath RoundedRect(Rectangle rect,int diameter) {
      var p=new GraphicsPath(); int x=rect.X,y=rect.Y,w=rect.Width,h=rect.Height,r=diameter;
      p.AddArc(x,y,r,r,180,90); p.AddArc(x+w-r,y,r,r,270,90); p.AddArc(x+w-r,y+h-r,r,r,0,90); p.AddArc(x,y+h-r,r,r,90,90); p.CloseFigure(); return p;
    }
    protected override void Dispose(bool disposing) {
      if(disposing) { typing.Stop(); typing.Dispose(); nameFont.Dispose(); }
      base.Dispose(disposing);
    }
    public void Say(string text) { if(revealText!=(text ?? "")&&MessageChanged!=null)MessageChanged(); typing.Stop(); revealText=text ?? ""; answer.Text=revealText; ResizeBubble(Expanded); answer.ScrollToTop(); }
    public void SayAnimated(string text,int prefixLength) {
      if(MessageChanged!=null)MessageChanged();
      typing.Stop(); revealText=text ?? "";
      prefixLength=Math.Max(0,Math.Min(prefixLength,revealText.Length));
      revealBoundaries=StringInfo.ParseCombiningCharacters(revealText);
      revealedElements=0;
      while(revealedElements<revealBoundaries.Length && revealBoundaries[revealedElements]<prefixLength) revealedElements++;
      int end=revealedElements<revealBoundaries.Length ? revealBoundaries[revealedElements] : revealText.Length;
      answer.Text=revealText.Substring(0,end); ResizeBubble(Expanded);
      if(prefixLength>0) answer.ScrollToEnd();
      if(end<revealText.Length) typing.Start();
    }
    public void ContinueReveal(string text) {
      if(!Visible || !text.StartsWith(CurrentText,StringComparison.Ordinal)) { Say(text); return; }
      revealText=text;
      revealBoundaries=StringInfo.ParseCombiningCharacters(revealText);
      revealedElements=0;
      while(revealedElements<revealBoundaries.Length && revealBoundaries[revealedElements]<CurrentText.Length) revealedElements++;
      if(CurrentText.Length<text.Length && !typing.Enabled) typing.Start();
    }
    void RevealStep() {
      bool follow=answer.ScrollOffset+answer.ClientSize.Height>=answer.ContentHeight-2;
      // Three text elements per tick: roughly 90 characters/second, without splitting surrogate pairs.
      revealedElements=Math.Min(revealBoundaries.Length,revealedElements+3);
      int end=revealedElements<revealBoundaries.Length ? revealBoundaries[revealedElements] : revealText.Length;
      answer.SetContent(revealText.Substring(0,end),true); ResizeBubble(Expanded);
      if(follow) answer.ScrollToEnd();
      if(end==revealText.Length) typing.Stop();
    }
    void FinishReveal() {
      if(!typing.Enabled) return;
      typing.Stop(); answer.SetContent(revealText,true); ResizeBubble(Expanded);
    }
    public void ScrollToEnd() { answer.ScrollToEnd(); }
    public string CurrentText { get { return answer.Text; } }
    public async Task VerifyTyping() {
      string text="快速逐字🙂e\u0301顯示，完整內容必須保留。"+new string('字',80);
      SayAnimated(text,0);
      if(CurrentText==text || !typing.Enabled) throw new Exception("Reply appeared all at once");
      await Task.Delay(180);
      if(CurrentText.Length==0 || CurrentText.Length>=text.Length) throw new Exception("Typewriter timer did not reveal progressively");
      for(int i=0;i<100 && typing.Enabled;i++) {
        if(CurrentText.Length>0 && Char.IsHighSurrogate(CurrentText[CurrentText.Length-1])) throw new Exception("Split emoji surrogate");
        await Task.Delay(32);
      }
      if(CurrentText!=text || typing.Enabled) throw new Exception("Typewriter did not complete and stop");
      SayAnimated(text,0); Say("新回覆"); await Task.Delay(80);
      if(CurrentText!="新回覆" || typing.Enabled) throw new Exception("Old timer overwrote replacement");
      string prefix="你：先前的問題\n\n露米：";
      SayAnimated(prefix+text,prefix.Length);
      if(CurrentText!=prefix) throw new Exception("History prefix was replayed");
      Hide(); if(typing.Enabled || CurrentText!=prefix+text) throw new Exception("Hidden bubble kept typing");
      Show(); Say("測試完成");
      Say(""); string streamed="";
      for(int i=0;i<20;i++) { streamed+="串流"; ContinueReveal(streamed); await Task.Delay(10); }
      if(CurrentText.Length==0) throw new Exception("Frequent chunks starved the typewriter timer");
      ContinueReveal(streamed+"完成");
      for(int i=0;i<100 && typing.Enabled;i++) await Task.Delay(32);
      if(CurrentText!=streamed+"完成") throw new Exception("Streaming reveal lost characters");
    }
    public void VerifyReplyScrolling(string output) {
      var oldBounds=PetBounds;
      Rectangle area=Screen.PrimaryScreen.WorkingArea;
      PetBounds=delegate {return new Rectangle(area.Left+area.Width/2,area.Bottom-220,192,208);};
      Say("短回覆"); ResizeBubble(false); int smallHeight=Height;
      Say("第一行\n第二行\n第三行\n第四行\n第五行\n第六行\n第七行\n第八行\n第九行\n第十行");
      if(Height<=smallHeight) throw new Exception("Long reply did not grow");
      string text="開頭\n";
      for(int i=1;i<=80;i++) text+="第 "+i+" 段：完整回覆應可在小泡泡捲動閱讀，不截斷內容。\n";
      text+="回覆結尾 END-OF-REPLY";
      ResizeBubble(false); Say(text); Input.Focus();
      using(var preview=new Bitmap(Width,Height)) { DrawToBitmap(preview,new Rectangle(0,0,Width,Height)); preview.Save(Path.Combine(output,"reply-scroll-top.png"),ImageFormat.Png); }
      int initial=answer.ScrollOffset;
      Native.SendMessage(answer.Handle,0x20A,new IntPtr(-120<<16),IntPtr.Zero);
      int scrolled=answer.ScrollOffset;
      if(scrolled<=initial || CurrentText!=text) throw new Exception("Compact reply scroll: before="+initial+", after="+scrolled+", preserved="+(CurrentText==text));
      answer.ScrollToEnd();
      if(answer.ContentHeight-answer.ScrollOffset>answer.ClientSize.Height) throw new Exception("Reply ending is unreachable");
      using(var preview=new Bitmap(Width,Height)) { DrawToBitmap(preview,new Rectangle(0,0,Width,Height)); preview.Save(Path.Combine(output,"reply-scroll-bottom.png"),ImageFormat.Png); }
      if(Height>area.Height-220-8) throw new Exception("Growing bubble exceeded room above pet");
      ResizeBubble(true); if(CurrentText!=text) throw new Exception("Expanding lost reply");
      ResizeBubble(false); if(CurrentText!=text) throw new Exception("Collapsing truncated reply");
      Say(text); if(answer.ScrollOffset!=0) throw new Exception("New reply did not reset to top");
      PetBounds=oldBounds;
    }
    public bool HasButtons() { foreach(Control c in Controls) if(c is ButtonBase) return true; return false; }
    public void UseContextMenu(ContextMenuStrip menu) {
      ContextMenuStrip=menu;
      foreach(Control c in Controls) {
        if(c.ContextMenuStrip!=null && c.ContextMenuStrip!=menu) c.ContextMenuStrip.Dispose();
        c.ContextMenuStrip=menu;
      }
      answer.UseContextMenu(menu);
    }
  }
  class Pet : Form {
    string petName;
    readonly PetLibrary library;
    PetAppearance appearance;
    readonly Bubble bubble; readonly Api api;
    readonly System.Windows.Forms.Timer motion = new System.Windows.Forms.Timer();
    readonly System.Windows.Forms.Timer messageExpiry = new System.Windows.Forms.Timer { Interval=15*60*1000 };
    void ArmMessageExpiry(){messageExpiry.Stop();if(!showHistory)messageExpiry.Start();}
    readonly System.Windows.Forms.Timer behavior = new System.Windows.Forms.Timer();
    readonly PetWander wander=new PetWander(Environment.TickCount);
    readonly Random behaviorRandom=new Random();
    ToolStripMenuItem wanderItem,varietyItem,followPointerItem;
    bool selectingArea,variety=true,backendProcessing;
    string gesture="",lastGesture="";
    double gestureUntil,nextGesture,lastBehaviorCheck;
    double lastInputAt;
    int lookDirection;
    readonly Queue<string> ambientGestures=new Queue<string>();
    static double Clock { get { return (double)System.Diagnostics.Stopwatch.GetTimestamp()/System.Diagnostics.Stopwatch.Frequency; } }
    readonly System.Windows.Forms.Timer bubbleMotion = new System.Windows.Forms.Timer();
    BubblePlacement placement; Point bubbleStart; DateTime bubbleMoveStart;
    readonly string positionFile;
    readonly string settingsFile;
    readonly string projectRoot;
    readonly ContextMenuStrip petMenu=new ContextMenuStrip();
    ToolStripMenuItem topItem, animationItem, historyItem, translucentItem, toggleBubbleItem, quitItem;
    bool showHistory;
    readonly VoiceController voice=new VoiceController();
    readonly NotificationController notifications=new NotificationController();
    bool voiceReply,voiceListening,voiceModuleEnabled=true;
    string lastReadReplyId="",lastReadText="";DateTime lastReadAt=DateTime.MinValue;
    string replyStreamId="",completedStreamId="",streamPrefix="",streamText="",speechStreamId="",speechPending="";
    ToolStripMenuItem appearanceMenu;
    ToolStripMenuItem clearImageItem;
    ChatImage pendingImage;
    ChatImage generatedImage;string generatedImagePath="";
    ChatDocument pendingDocument;
    bool preparingImage;
    bool importing;
    bool exiting;
    Task exitTask;
    Action shutdownConfirmed;
    Bitmap current; Point dragStart, original; bool dragging, moved, busy, animate=true;
    int phase=0; bool followPointer=false; string activity="rest", fullText="我在這裡。想知道天氣，或有什麼問題，直接和我說。";
    readonly List<string> conversation = new List<string>();
    public Pet(string root, string url, bool connect,string testLibrary=null) {
      projectRoot=root;
      library=new PetLibrary(root,testLibrary); appearance=library.Load("lumi"); petName=appearance.Name;
      voice.Root=root;
      Text=petName+"桌寵"; FormBorderStyle=FormBorderStyle.None; ShowInTaskbar=false; TopMost=true;
      StartPosition=FormStartPosition.Manual; ClientSize=new System.Drawing.Size(192,208);
      positionFile=RuntimePaths.Get(root,"native-pet","position-"+new Uri(url).Port+".json");
      settingsFile=RuntimePaths.Get(root,"native-pet","settings-"+new Uri(url).Port+".json");
      Rectangle screen=Screen.PrimaryScreen.WorkingArea; Location=new Point(screen.Right-Width-36,screen.Bottom-Height+28);
      try { if(File.Exists(positionFile)) { var p=Json.Decode(File.ReadAllText(positionFile)); Location=new Point(Convert.ToInt32(p["x"]),Convert.ToInt32(p["y"])); } } catch {}
      Clamp(); bubble=new Bubble(petName); bubble.Submitted=Submit; api=new Api(url);
      bubble.GeneratedImageClicked=delegate{try{if(generatedImagePath.Length>0&&File.Exists(generatedImagePath))System.Diagnostics.Process.Start(generatedImagePath);}catch(Exception e){ShowText("無法開啟圖片："+e.Message,false);}};
      bubble.PetBounds=delegate { return Bounds; };
      LoadPetSettings(); voiceModuleEnabled=VoiceModuleEnabled();if(!voiceModuleEnabled){voiceReply=false;voiceListening=false;} if(connect)showHistory=false; BuildMenu(); bubble.UseContextMenu(petMenu);
      bubble.MessageChanged=ArmMessageExpiry;messageExpiry.Tick+=delegate{messageExpiry.Stop();if(!showHistory)bubble.Hide();};
      bubble.VisibleChanged+=delegate{if(bubble.Visible)ArmMessageExpiry();};
      FormClosed+=delegate{messageExpiry.Stop();messageExpiry.Dispose();};
      lastInputAt=Clock;
      bubble.Input.KeyDown+=delegate{lastInputAt=Clock;};
      bubble.Input.TextChanged+=delegate{lastInputAt=Clock;};
      voice.Heard=delegate(string text){if(!IsDisposed && IsHandleCreated)BeginInvoke((Action)delegate{if(!busy && !exiting){bubble.Input.Text=text;Submit(text);}});};
      voice.Failed=delegate(string error){if(!IsDisposed && IsHandleCreated)BeginInvoke((Action)delegate{if(!voice.Listening){voice.Stop();voiceListening=false;SavePetSettings();}ShowText("語音功能提示："+error,false);});};
      if(connect)Shown+=async delegate{if(voiceReply&&voice.TtsEngine=="kokoro")await WarmVoice(false);if(voiceListening&&!voice.Listening)SetListening(true,false);};
      notifications.Received=async delegate(string id,string app){try{await api.Call("notification",new {id=id,app=app});}catch{}};
      notifications.Failed=delegate(string error){ShowText("通知監看已停止："+error);};
      FormClosed+=delegate{voice.Dispose();notifications.Dispose();};
      bubble.WireDrop(ImageDragEnter,ImageDrop);
      bubble.Input.PasteData=ReceiveImageData;
      bubble.Input.PasteError=delegate(Exception e) { bubble.Say("無法貼上圖片："+e.Message); };
      bubble.SizeChanged+=delegate { PositionBubble(); };
      motion.Interval=250; motion.Tick+=delegate { if(animate && appearance.Animated) { phase++; Render(); } };
      behavior.Interval=500;behavior.Tick+=delegate{BehaviorTick();};behavior.Start();nextGesture=Clock+12;
      bubbleMotion.Interval=16; bubbleMotion.Tick+=delegate {
        double progress=Math.Min(1,(DateTime.UtcNow-bubbleMoveStart).TotalMilliseconds/180);
        double eased=1-Math.Pow(1-progress,3);
        bubble.Location=new Point((int)Math.Round(bubbleStart.X+(placement.Location.X-bubbleStart.X)*eased),(int)Math.Round(bubbleStart.Y+(placement.Location.Y-bubbleStart.Y)*eased));
        PointBubble(); if(progress>=1) bubbleMotion.Stop();
      };
      LocationChanged+=delegate { if(!wander.Moving||bubble.Visible)PositionBubble(); };
      Shown+=async delegate { Render(); UpdateMotion(); PositionBubble(); bubble.Say(fullText); if(!bubble.Visible)bubble.Show(this);
        if(connect) {
          string initial=fullText;
          try {
            var history=await api.History();
            if(!IsDisposed && !exiting && !busy && conversation.Count==0 && fullText==initial) {
              foreach(var message in history) {
                string role=Json.Text(message,"role"),text=Json.Text(message,"content");
                if(role!="user" && role!="assistant") continue;
                conversation.Add((role=="user" ? "你" : petName)+"："+text);
              }
              // Restore history for explicit viewing without replaying the last reply.
            }
          } catch { }
          if(!IsDisposed) await api.Listen(Event);
        } };
      FormClosed+=delegate { motion.Stop(); motion.Dispose(); behavior.Stop();behavior.Dispose();bubbleMotion.Stop(); bubbleMotion.Dispose(); petMenu.Dispose(); api.Dispose(); bubble.Dispose(); appearance.Dispose(); if(current!=null) current.Dispose(); if(pendingImage!=null) pendingImage.Dispose();if(generatedImage!=null)generatedImage.Dispose(); if(pendingDocument!=null)pendingDocument.Dispose(); };
    }
    void BuildMenu() {
      petMenu.Font=Bubble.TextFont(10);
      petMenu.Items.Add("功能與設定（含模組管理器）",null,delegate{OpenFeatureManager();});
      var settings=new ToolStripMenuItem("外觀與動作");
      settings.DropDownItems.Add("框選活動區域…",null,delegate{BeginSelectArea();});
      wanderItem=new ToolStripMenuItem("在區域內自由走動");wanderItem.Click+=delegate{SetWandering(!wander.Enabled);};settings.DropDownItems.Add(wanderItem);
      settings.DropDownItems.Add("清除活動區域",null,delegate{wander.Enabled=false;wander.Area=Rectangle.Empty;wander.Pause(Clock);SavePetSettings();});
      var actions=new ToolStripMenuItem("寵物動作");
      string[] labels={"揮手","跳一下"};
      string[] states=PetAnimations.AmbientNames;
      for(int i=0;i<labels.Length;i++){string state=states[i];actions.DropDownItems.Add(labels[i],null,delegate{PlayGesture(state,3);});}
      settings.DropDownItems.Add(actions);
      var audio=new ToolStripMenuItem("語音"){Enabled=voiceModuleEnabled};
      topItem=new ToolStripMenuItem("保持置頂"); topItem.Click+=delegate { SetTopMost(!TopMost); };
      animationItem=new ToolStripMenuItem("播放動畫"); animationItem.Click+=delegate { SetAnimation(!animate); };
      settings.DropDownItems.Add(topItem); settings.DropDownItems.Add(animationItem);
      followPointerItem=new ToolStripMenuItem("跟隨滑鼠視線（16 方向）");followPointerItem.Click+=delegate{SetFollowPointer(!followPointer);};settings.DropDownItems.Add(followPointerItem);
      varietyItem=new ToolStripMenuItem("自主小動作");varietyItem.Click+=delegate{variety=!variety;gesture="";nextGesture=Clock+12;SavePetSettings();};settings.DropDownItems.Add(varietyItem);
      audio.DropDownItems.Add("開啟／停止語音聆聽",null,delegate{SetListening(!voice.Listening);});
      audio.DropDownItems.Add("測試麥克風（3 秒）",null,async delegate{await TestMicrophone();});
      audio.DropDownItems.Add("開啟／關閉語音回覆",null,async delegate{await SetVoiceReply(!voiceReply);});
      foreach(bool input in new[]{true,false}){bool isInput=input;var devices=new ToolStripMenuItem(input?"接收麥克風":"語音播放裝置");devices.DropDownItems.Add("載入裝置…");devices.DropDownOpening+=delegate{BuildAudioMenu(devices,isInput);};audio.DropDownItems.Add(devices);}
      var engines=new ToolStripMenuItem("TTS 引擎");engines.DropDownOpening+=delegate{BuildTtsEngineMenu(engines);};audio.DropDownItems.Add(engines);
      var speechSpeed=new ToolStripMenuItem("說話速度");speechSpeed.DropDownOpening+=delegate{BuildSpeechSpeedMenu(speechSpeed);};audio.DropDownItems.Add(speechSpeed);
      audio.DropDownItems.Add("測試語音播放",null,delegate{TestVoiceOutput();});
      var voices=new ToolStripMenuItem("TTS 聲線（Windows）");voices.DropDownItems.Add("載入聲線…");voices.DropDownOpening+=delegate{BuildVoiceMenu(voices);};audio.DropDownItems.Add(voices);
      var kokoroVoices=new ToolStripMenuItem("Kokoro 聲線");kokoroVoices.DropDownOpening+=delegate{BuildKokoroVoiceMenu(kokoroVoices);};audio.DropDownItems.Add(kokoroVoices);
      historyItem=new ToolStripMenuItem("顯示歷史對話") { Checked=showHistory };
      historyItem.Click+=delegate { SetHistory(!showHistory); }; settings.DropDownItems.Add(historyItem);
      translucentItem=new ToolStripMenuItem("半透明泡泡") { Checked=bubble.Opacity<1 };
      translucentItem.Click+=delegate { SetTranslucent(bubble.Opacity>=1); }; settings.DropDownItems.Add(translucentItem);
      settings.DropDownItems.Add(new ToolStripSeparator());
      settings.DropDownItems.Add("放大桌寵",null,delegate { ChangeSize(48); });
      settings.DropDownItems.Add("縮小桌寵",null,delegate { ChangeSize(-48); });
      settings.DropDownItems.Add(new ToolStripSeparator());
      appearanceMenu=new ToolStripMenuItem("更換寵物形象");
      appearanceMenu.DropDownOpening+=delegate { RebuildAppearanceMenu(); };
      // Populate once so WinForms displays the submenu arrow before opening.
      RebuildAppearanceMenu(); settings.DropDownItems.Add(appearanceMenu);
      settings.DropDownItems.Add("傳送外觀到手機",null,async delegate { await TransferAppearance(); });
      settings.DropDownItems.Add("寵物外觀編輯器…",null,delegate { EditAppearance(); });
      petMenu.Items.Add(settings);petMenu.Items.Add(audio);
      toggleBubbleItem=new ToolStripMenuItem("收起聊天泡泡");
      toggleBubbleItem.Click+=delegate { if(bubble.Visible) bubble.Hide(); else OpenBubbleForInput(); };
      petMenu.Items.Add(toggleBubbleItem); petMenu.Items.Add(new ToolStripSeparator());
      clearImageItem=new ToolStripMenuItem("移除待傳圖片"); clearImageItem.Visible=false;
      clearImageItem.Click+=delegate { ClearImage(); }; petMenu.Items.Add(clearImageItem);
      petMenu.Items.Add("僅關閉桌寵（背景繼續）",null,delegate { Close(); });
      quitItem=new ToolStripMenuItem("關閉桌寵（停止背景服務）");
      quitItem.Click+=delegate { exitTask=QuitAgent(); };
      petMenu.Items.Add(quitItem);
      petMenu.Opening+=delegate {
        topItem.Checked=TopMost; animationItem.Checked=animate; animationItem.Enabled=appearance.Animated;
        wanderItem.Checked=wander.Enabled;wanderItem.Enabled=appearance.Animated;varietyItem.Checked=variety;actions.Enabled=appearance.Animated&&animate;
        followPointerItem.Checked=followPointer;followPointerItem.Enabled=appearance.Animated;
        historyItem.Checked=showHistory;
        translucentItem.Checked=bubble.Opacity<1;
        appearanceMenu.Enabled=!importing && !exiting;
        toggleBubbleItem.Text=bubble.Visible ? "收起聊天泡泡" : "顯示聊天泡泡";
        quitItem.Enabled=!exiting;
        clearImageItem.Visible=pendingImage!=null || pendingDocument!=null; clearImageItem.Enabled=!busy && !preparingImage;
        clearImageItem.Text=pendingDocument!=null ? "移除待傳文件" : "移除待傳圖片";
      };
    }
    void OpenFeatureManager(){
      try {
        string script=Path.Combine(projectRoot,"Open-DailyManager.ps1");
        var info=new System.Diagnostics.ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+script+"\"");
        info.UseShellExecute=false;info.CreateNoWindow=true;info.WindowStyle=System.Diagnostics.ProcessWindowStyle.Hidden;
        System.Diagnostics.Process.Start(info);
      }catch(Exception e){ShowText("無法開啟功能設定："+e.GetBaseException().Message);}
    }
    bool VoiceModuleEnabled(){
      if(!File.Exists(Path.Combine(projectRoot,"daily-agent","features","voice","index.js")))return false;
      string directory=Environment.GetEnvironmentVariable("DAILY_DATA");if(String.IsNullOrEmpty(directory))directory=Path.Combine(projectRoot,"daily-agent","data");
      string file=Path.Combine(directory,"modules.json");if(!File.Exists(file))return true;
      try{var settings=Json.Decode(File.ReadAllText(file));if(!settings.ContainsKey("enabled"))return true;var enabled=settings["enabled"] as Dictionary<string,object>;return enabled==null||!enabled.ContainsKey("voice")||!Object.Equals(enabled["voice"],false);}catch{return false;}
    }
    void BuildAudioMenu(ToolStripMenuItem menu,bool input){
      menu.DropDownItems.Clear();string selected=input?voice.InputDeviceId:voice.OutputDeviceId;
      Action<string> choose=delegate(string id){try{if(input)voice.SelectInput(id);else voice.SelectOutput(id);SavePetSettings();}catch(Exception e){ShowText("無法切換音訊裝置："+e.GetBaseException().Message);}};
      var system=new ToolStripMenuItem("跟隨 Windows 預設裝置"){Checked=String.IsNullOrEmpty(selected)};system.Click+=delegate{choose("");};menu.DropDownItems.Add(system);menu.DropDownItems.Add(new ToolStripSeparator());
      try{var devices=input?AudioDevices.Inputs():AudioDevices.Outputs();bool found=String.IsNullOrEmpty(selected);
        foreach(var device in devices){string id=device.Id;bool current=String.Equals(id,selected,StringComparison.OrdinalIgnoreCase);found|=current;var item=new ToolStripMenuItem(device.Name.Replace("&","&&")){Checked=current};item.Click+=delegate{choose(id);};menu.DropDownItems.Add(item);}
        if(devices.Count==0)menu.DropDownItems.Add(new ToolStripMenuItem("沒有可用裝置"){Enabled=false});
        if(!found)menu.DropDownItems.Add(new ToolStripMenuItem("原選定裝置未連接（保留設定）"){Enabled=false,Checked=true});
      }catch(Exception e){menu.DropDownItems.Add(new ToolStripMenuItem("無法列出裝置："+e.GetBaseException().Message){Enabled=false});}
    }
    void BuildVoiceMenu(ToolStripMenuItem menu){
      menu.DropDownItems.Clear();Action<string> choose=delegate(string id){try{voice.SelectVoice(id);SavePetSettings();}catch(Exception e){ShowText("無法切換聲線："+e.GetBaseException().Message);}};
      var automatic=new ToolStripMenuItem("自動（優先繁體中文）"){Checked=String.IsNullOrEmpty(voice.VoiceId)};automatic.Click+=delegate{choose("");};menu.DropDownItems.Add(automatic);menu.DropDownItems.Add(new ToolStripSeparator());
      try{bool found=String.IsNullOrEmpty(voice.VoiceId);foreach(var device in AudioDevices.Voices()){string id=device.Id;bool current=String.Equals(id,voice.VoiceId,StringComparison.OrdinalIgnoreCase);found|=current;var item=new ToolStripMenuItem(device.Name.Replace("&","&&")){Checked=current};item.Click+=delegate{choose(id);};menu.DropDownItems.Add(item);}if(!found)menu.DropDownItems.Add(new ToolStripMenuItem("原選定聲線已無法使用"){Checked=true,Enabled=false});}
      catch(Exception e){menu.DropDownItems.Add(new ToolStripMenuItem("無法列出聲線："+e.GetBaseException().Message){Enabled=false});}
    }
    void BuildTtsEngineMenu(ToolStripMenuItem menu){
      menu.DropDownItems.Clear();foreach(string id in new[]{"windows","kokoro"}){string value=id;var item=new ToolStripMenuItem(id=="windows"?"Windows TTS":"Kokoro 本機（CPU"+(voice.KokoroWarm?"，已暖機":"")+"）"){Checked=voice.TtsEngine==id};item.Click+=async delegate{try{voice.SelectTtsEngine(value);SavePetSettings();if(value=="kokoro"&&voiceReply)await WarmVoice(true);else ShowText(value=="kokoro"?"已切換到 Kokoro。本機語音會在開啟語音回覆時暖機。":"已切換到 Windows TTS。");}catch(Exception e){ShowText("無法切換 TTS："+e.GetBaseException().Message);}};menu.DropDownItems.Add(item);}
    }
    void BuildKokoroVoiceMenu(ToolStripMenuItem menu){
      menu.DropDownItems.Clear();foreach(string group in new[]{"中文女聲","中文男聲","英文女聲"}){var submenu=new ToolStripMenuItem(group);foreach(var v in KokoroVoiceCatalog.All().FindAll(x=>x.Group==group)){var voiceItem=v;var item=new ToolStripMenuItem(v.Id){Checked=voice.KokoroVoiceId==v.Id};item.Click+=async delegate{try{voice.SelectKokoroVoice(voiceItem.Id);voice.SelectTtsEngine("kokoro");SavePetSettings();if(voiceReply)await WarmVoice(true);else ShowText("已選擇 Kokoro 聲線 "+voiceItem.Id+"。語音回覆開啟時才會暖機；想先聽可說「測試語音播放」。");}catch(Exception e){ShowText("無法切換 Kokoro 聲線："+e.GetBaseException().Message);}};submenu.DropDownItems.Add(item);}menu.DropDownItems.Add(submenu);}
    }
    void BuildSpeechSpeedMenu(ToolStripMenuItem menu){menu.DropDownItems.Clear();foreach(double speed in new[]{.7,.85,1.0,1.15,1.3,1.4}){double value=speed;var item=new ToolStripMenuItem(speed.ToString("0.##")+"×"){Checked=Math.Abs(voice.SpeechSpeed-speed)<.001};item.Click+=delegate{SetSpeechSpeed(value);};menu.DropDownItems.Add(item);}}
    void SetSpeechSpeed(double speed){voice.SetSpeechSpeed(speed);SavePetSettings();ShowText("說話速度已調整為 "+voice.SpeechSpeed.ToString("0.##")+" 倍。");}
    void TestVoiceOutput(){if(!voiceModuleEnabled){ShowText("語音模組已停用。");return;}try{voice.SayPreview("你好，我是"+petName+"。這是目前選擇的語音播放裝置。");}catch(Exception e){ShowText("語音播放失敗："+e.GetBaseException().Message);}}
    async Task WarmVoice(bool announce){try{if(announce)ShowHint("Kokoro 正在暖機…");await voice.WarmKokoro();if(announce){ShowHint("Kokoro 已暖機，接下來的語音回覆會直接使用 CPU 產生。");voice.Say("語音回覆已經開啟，現在聽得到我嗎？");}}catch(Exception e){voiceReply=false;voice.UnloadTts();SavePetSettings();ShowText("Kokoro 暖機失敗，語音回覆已關閉："+e.GetBaseException().Message,false);}}
    async Task SetVoiceReply(bool enabled){if(enabled&&!voiceModuleEnabled){ShowText("語音模組已停用。");return;}voiceReply=enabled;SavePetSettings();if(!enabled){voice.UnloadTts();ShowText("語音回覆已關閉，Kokoro 已卸載。",false);return;}if(voice.TtsEngine=="kokoro")await WarmVoice(true);else {ShowText("語音回覆已開啟。",false);voice.Say("語音回覆已經開啟，現在聽得到我嗎？");}}
    async Task TransferAppearance(){
      try{
        int cellW=appearance.Animated?Math.Min(128,appearance.CellWidth):Math.Min(512,appearance.Image.Width);
        int cellH=Math.Max(1,(int)Math.Round((double)appearance.CellHeight*cellW/appearance.CellWidth));
        if(!appearance.Animated && cellH>512){cellW=Math.Max(1,cellW*512/cellH);cellH=512;}
        int width=cellW*(appearance.Animated?8:1),height=cellH*(appearance.Animated?11:1);string encoded;
        using(var scaled=new Bitmap(width,height,PixelFormat.Format32bppArgb)){
          using(var graphics=Graphics.FromImage(scaled)){graphics.Clear(Color.Transparent);graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;graphics.DrawImage(appearance.Image,0,0,width,height);}
          using(var output=new MemoryStream()){scaled.Save(output,ImageFormat.Png);encoded=Convert.ToBase64String(output.ToArray());}
        }
        var result=await api.Call("mobile/appearance",new {name=petName,animated=appearance.Animated,image=encoded});
        ShowText("外觀已準備好傳到手機。已配對 "+Json.Text(result,"devices")+" 台；在線手機會在一分鐘內接收，離線手機下次連線時更新。聊天與記憶不受影響。");
      }catch(Exception e){ShowText("外觀沒有傳送成功："+e.Message);}
    }
    void SaveGeneratedImage(){
      if(generatedImagePath.Length==0||!File.Exists(generatedImagePath)){ShowText("目前沒有可儲存的生圖結果。",false);return;}
      try{
        using(var dialog=new SaveFileDialog()){
          dialog.Title="儲存剛才生成的圖片";dialog.Filter="PNG 圖片|*.png";dialog.FileName=Path.GetFileName(generatedImagePath);
          string pictures=Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);if(Directory.Exists(pictures))dialog.InitialDirectory=pictures;
          if(dialog.ShowDialog(this)==DialogResult.OK){File.Copy(generatedImagePath,dialog.FileName,true);ShowText("圖片已儲存到「"+dialog.FileName+"」。",false);}
        }
      }catch(Exception e){ShowText("圖片沒有儲存成功："+e.Message,false);}
    }
    void ShowGeneratedImageFile(string file){
      try{
        if(String.IsNullOrWhiteSpace(file)||!Path.IsPathRooted(file)||!File.Exists(file))throw new Exception("找不到生成的原圖。");
        var next=ChatImage.FromFile(library,file);var previous=generatedImage;generatedImage=next;generatedImagePath=file;
        bubble.SetGeneratedImage(next);if(previous!=null)previous.Dispose();PositionBubble();
      }catch(Exception e){ShowText("圖片已生成，但縮圖載入失敗："+e.Message,false);}
    }
    void ImageDragEnter(object sender,DragEventArgs e) {
      e.Effect=DragDropEffects.None;
      if(busy || preparingImage || exiting || e.Data==null) return;
      if(e.Data.GetDataPresent(DataFormats.FileDrop)) {
        var files=e.Data.GetData(DataFormats.FileDrop) as string[];
        if(files!=null && files.Length==1 && (ChatImage.Supported(files[0]) || ChatDocument.Supported(files[0]))) e.Effect=DragDropEffects.Copy;
      } else if(e.Data.GetDataPresent(DataFormats.Bitmap)) e.Effect=DragDropEffects.Copy;
    }
    void ImageDrop(object sender,DragEventArgs e) { ReceiveImageData(e.Data); }
    bool ReceiveImageData(IDataObject data) {
      if(data==null) return false;
      bool image=data.GetDataPresent(DataFormats.Bitmap),files=data.GetDataPresent(DataFormats.FileDrop);
      if(!image && !files) return false;
      if(busy || preparingImage || exiting) return true;
      try {
        if(files) {
          var names=data.GetData(DataFormats.FileDrop) as string[];
          if(names==null || names.Length!=1 || (!ChatImage.Supported(names[0]) && !ChatDocument.Supported(names[0]))) throw new Exception("一次請放入一張圖片或一份 TXT、Markdown、PDF 文件。");
          if(ChatDocument.Supported(names[0]))PrepareDocumentFile(names[0]);else PrepareImageFile(names[0]);
        } else {
          var source=data.GetData(DataFormats.Bitmap) as Image;
          if(source==null) throw new Exception("剪貼簿沒有可讀取的圖片。");
          SetPendingImage(ChatImage.Prepare(source,"剪貼簿圖片"));
        }
      } catch(Exception e) { bubble.Say("無法加入附件："+e.Message); }
      return true;
    }
    async void PrepareImageFile(string file) {
      preparingImage=true; bubble.Input.Enabled=false;
      try {
        var image=await Task.Run(()=>ChatImage.FromFile(library,file));
        if(IsDisposed || exiting) {image.Dispose();return;}
        SetPendingImage(image);
      } catch(Exception e) { if(!IsDisposed) bubble.Say("無法加入圖片："+e.Message); }
      finally { preparingImage=false; if(!IsDisposed && !exiting) bubble.Input.Enabled=!busy; }
    }
    void SetPendingImage(ChatImage image) {
      var document=pendingDocument;pendingDocument=null;
      var previous=pendingImage; pendingImage=image; bubble.SetAttachment(image);
      if(document!=null)document.Dispose();
      clearImageItem.Visible=true;
      if(previous!=null) previous.Dispose(); OpenBubbleForInput();
    }
    async void PrepareDocumentFile(string file) {
      preparingImage=true;bubble.Input.Enabled=false;
      try {
        var document=await Task.Run(()=>ChatDocument.FromFile(file));
        if(IsDisposed || exiting){document.Dispose();return;}
        var previous=pendingDocument;var image=pendingImage;
        pendingImage=null;pendingDocument=document;bubble.SetDocument(document);clearImageItem.Visible=true;
        if(previous!=null)previous.Dispose();if(image!=null)image.Dispose();OpenBubbleForInput();
      }catch(Exception e){if(!IsDisposed)bubble.Say("無法加入文件："+e.Message);}
      finally{preparingImage=false;if(!IsDisposed && !exiting)bubble.Input.Enabled=!busy;}
    }
    void ClearImage() {
      if(busy || preparingImage) return;
      var previous=pendingImage; pendingImage=null; bubble.SetAttachment(null);
      var document=pendingDocument;pendingDocument=null;if(document!=null)document.Dispose();
      clearImageItem.Visible=false;
      if(previous!=null) previous.Dispose(); PositionBubble();
    }
    void RebuildAppearanceMenu() {
      foreach(ToolStripItem item in new List<ToolStripItem>(Items(appearanceMenu))) item.Dispose();
      appearanceMenu.DropDownItems.Clear();
      var builtin=new ToolStripMenuItem("內建露米") { Checked=appearance.Id=="lumi" };
      builtin.Click+=delegate { SelectAppearance("lumi"); }; appearanceMenu.DropDownItems.Add(builtin);
      appearanceMenu.DropDownItems.Add("匯入圖片或動畫包…",null,async delegate { await PickAppearance(); });
      appearanceMenu.DropDownItems.Add("PET 素材快速匯入…",null,delegate { QuickImportAppearance(); });
      var pets=library.List();
      if(pets.Count>0) appearanceMenu.DropDownItems.Add(new ToolStripSeparator());
      foreach(var entry in pets) {
        string id=entry.Key;
        var item=new ToolStripMenuItem(entry.Value) { Checked=appearance.Id==id };
        item.Click+=delegate { SelectAppearance(id); }; appearanceMenu.DropDownItems.Add(item);
      }
    }
    static IEnumerable<ToolStripItem> Items(ToolStripMenuItem menu) { foreach(ToolStripItem item in menu.DropDownItems) yield return item; }
    void SelectAppearance(string id) {
      if(importing || exiting) return;
      try { ApplyAppearance(library.Load(id)); SavePetSettings(); }
      catch(Exception e) { bubble.Say("無法載入這個形象："+e.Message+"\n目前的形象已保留。"); OpenBubbleForInput(); }
    }
    void EditAppearance() {
      if(importing||exiting)return;
      importing=true;wander.Pause(Clock);bool restore=bubble.Visible;bubble.Hide();
      try {using(var editor=new PetAppearanceEditor(library,appearance,false,api)){
        if(editor.ShowDialog(this)==DialogResult.OK&&editor.Saved!=null){ApplyAppearance(editor.Saved);SavePetSettings();}
      }}catch(Exception e){MessageBox.Show(this,e.Message,"寵物外觀編輯器");}
      finally {importing=false;if(restore)bubble.Show(this);}
    }
    void QuickImportAppearance() {
      if(importing||exiting)return;
      importing=true;wander.Pause(Clock);bool restore=bubble.Visible;bubble.Hide();
      try {using(var tool=new PetQuickImport(library,true)){
        if(tool.ShowDialog(this)==DialogResult.OK&&tool.Saved!=null){ApplyAppearance(tool.Saved);SavePetSettings();}
      }}catch(Exception e){MessageBox.Show(this,e.Message,"PET 素材快速匯入");}
      finally {importing=false;if(restore)bubble.Show(this);RebuildAppearanceMenu();}
    }
    void ApplyAppearance(PetAppearance next) {
      var previous=appearance; appearance=next; petName=next.Name; phase=0;gesture="";wander.Pause(Clock);
      Text=petName+"桌寵"; bubble.SetPetName(petName);
      // Only display assets change: no chat messages, history, models or memory are reset.
      UpdateMotion(); Render();
      if(previous!=null) previous.Dispose();
    }
    void UpdateMotion() { if(animate && appearance.Animated) motion.Start(); else {motion.Stop();wander.Pause(Clock);} }
    void ReconcileArea(){
      if(wander.Area.IsEmpty)return;
      Rectangle best=Rectangle.Empty;
      foreach(var screen in Screen.AllScreens){Rectangle part=Rectangle.Intersect(wander.Area,screen.WorkingArea);if((long)part.Width*part.Height>(long)best.Width*best.Height)best=part;}
      wander.Area=best;if(!PetWander.Fits(best,Size))wander.Enabled=false;
    }
    void BeginSelectArea(){
      if(selectingArea||exiting)return;
      selectingArea=true;wander.Pause(Clock);bool wasVisible=bubble.Visible;bubble.Hide();petMenu.Close();
      try{using(var picker=new ActivityAreaPicker()){
        if(picker.ShowDialog()!=DialogResult.OK){if(wasVisible)bubble.Show(this);return;}
        Rectangle chosen=picker.SelectedArea;
        Rectangle best=Rectangle.Empty;foreach(var screen in Screen.AllScreens){Rectangle part=Rectangle.Intersect(chosen,screen.WorkingArea);if((long)part.Width*part.Height>(long)best.Width*best.Height)best=part;}
        if(!PetWander.Fits(best,Size)){ShowText("這個區域放不下目前大小的寵物，請框選更大一點，或先縮小桌寵。");return;}
        wander.Area=best;wander.Enabled=appearance.Animated;Location=PetWander.Constrain(Location,best,Size);SavePetSettings();Render();
        if(!appearance.Animated)ShowText("活動區域已保存。這是靜態圖片；換成完整 v2 動畫寵物後就能開啟走動。");
      }}finally{selectingArea=false;nextGesture=Clock+10;}
    }
    void SetWandering(bool enabled){
      if(enabled&&!appearance.Animated){ShowText("這個外觀是靜態圖片，需要完整 v2 動畫包才能走路。");return;}
      ReconcileArea();if(enabled&&!PetWander.Fits(wander.Area,Size)){BeginSelectArea();return;}
      wander.Enabled=enabled;wander.Pause(Clock);if(enabled){animate=true;UpdateMotion();bubble.Hide();}SavePetSettings();
    }
    void PlayGesture(string state,double seconds){
      if(!appearance.Animated||!animate||busy||backendProcessing||exiting)return;
      wander.Pause(Clock);gesture=state;lastGesture=state;gestureUntil=Clock+seconds;phase=0;lookDirection=behaviorRandom.Next(16);motion.Interval=state=="look"?250:PetAnimations.Interval(PetAnimations.Row(state));nextGesture=gestureUntil+8+behaviorRandom.Next(7);Render();
    }
    int AnimationRow(){
      if(dragging&&moved)return Left>=original.X?1:2;
      if(busy||backendProcessing||replyStreamId.Length>0)return 7;
      if(wander.Moving)return PetAnimations.Row(wander.Activity);
      if(gesture.Length>0&&Clock<gestureUntil)return gesture=="look"?9:PetAnimations.Row(gesture);
      return PetAnimations.Row(activity);
    }
    void BehaviorTick(){
      if(exiting||IsDisposed)return;double now=Clock;
      if((busy||backendProcessing||replyStreamId.Length>0||now-lastInputAt<12)&&gesture.Length>0){gesture="";phase=0;Render();}
      if(now>gestureUntil&&gesture.Length>0){gesture="";activity="rest";phase=0;Render();}
      if(now-lastBehaviorCheck>2){lastBehaviorCheck=now;ReconcileArea();}
      bool blocked=dragging||selectingArea||petMenu.Visible||busy||backendProcessing||replyStreamId.Length>0||importing||preparingImage||!animate||!appearance.Animated||bubble.Visible||gesture.Length>0||Bounds.Contains(Cursor.Position);
      Point next=wander.Step(Location,Size,now,blocked);bool walking=wander.Moving;
      behavior.Interval=walking?40:500;
      if(next!=Location){Location=next;Render();}
      if(animate&&appearance.Animated)motion.Interval=PetAnimations.Interval(AnimationRow());
      if(variety&&animate&&appearance.Animated&&!busy&&!backendProcessing&&replyStreamId.Length==0&&!dragging&&!walking&&!importing&&!preparingImage&&!selectingArea&&!petMenu.Visible&&now-lastInputAt>=12&&gesture.Length==0&&now>=nextGesture){
        if(ambientGestures.Count==0){var choices=new List<string>(PetAnimations.AmbientNames);while(choices.Count>0){int i=behaviorRandom.Next(choices.Count);ambientGestures.Enqueue(choices[i]);choices.RemoveAt(i);}}
        string state=ambientGestures.Dequeue();if(state==lastGesture&&ambientGestures.Count>0){ambientGestures.Enqueue(state);state=ambientGestures.Dequeue();}PlayGesture(state,state=="look"?4:PetAnimations.Counts[PetAnimations.Row(state)]*PetAnimations.Interval(PetAnimations.Row(state))/1000.0*2);
      }
    }
    async Task PickAppearance() {
      if(importing || exiting) return;
      string source;
      using(var dialog=new OpenFileDialog { Title="載入寵物形象",Filter="寵物圖片或動畫包|*.png;*.webp;*.zip|去背圖片|*.png;*.webp|v2 動畫包|*.zip",CheckFileExists=true,Multiselect=false,RestoreDirectory=true }) {
        if(dialog.ShowDialog(bubble)!=DialogResult.OK) return;
        source=dialog.FileName;
      }
      await ImportAppearance(source);
    }
    async Task ImportAppearance(string source) {
      importing=true; appearanceMenu.Enabled=false;
      bubble.Say("正在讀取寵物形象…"); if(!bubble.Visible) bubble.Show(this);
      try {
        var next=await Task.Run(()=>library.Import(source));
        if(IsDisposed || exiting) { next.Dispose(); return; }
        ApplyAppearance(next); SavePetSettings(); RenderConversation();
      } catch(Exception e) {
        if(!IsDisposed && !exiting) bubble.Say("匯入失敗："+e.Message+"\n目前的寵物形象已保留。");
      } finally { importing=false; if(!IsDisposed) appearanceMenu.Enabled=!exiting; }
    }
    void LoadPetSettings() {
      try { if(File.Exists(settingsFile)) {
        var s=Json.Decode(File.ReadAllText(settingsFile));
        if(s.ContainsKey("topMost")) TopMost=bubble.TopMost=Convert.ToBoolean(s["topMost"]);
        if(s.ContainsKey("animate")) animate=Convert.ToBoolean(s["animate"]);
        if(s.ContainsKey("variety"))variety=Convert.ToBoolean(s["variety"]);
        if(s.ContainsKey("followPointer"))followPointer=Convert.ToBoolean(s["followPointer"]);
        if(s.ContainsKey("wanderArea")){var area=s["wanderArea"] as Dictionary<string,object>;if(area!=null)wander.Area=new Rectangle(Convert.ToInt32(area["x"]),Convert.ToInt32(area["y"]),Math.Max(0,Convert.ToInt32(area["width"])),Math.Max(0,Convert.ToInt32(area["height"])));}
        if(s.ContainsKey("wanderEnabled"))wander.Enabled=Convert.ToBoolean(s["wanderEnabled"]);
        if(s.ContainsKey("showHistory")) showHistory=Convert.ToBoolean(s["showHistory"]);
        if(s.ContainsKey("voiceReply")) voiceReply=Convert.ToBoolean(s["voiceReply"]);
        if(s.ContainsKey("voiceListening")) voiceListening=Convert.ToBoolean(s["voiceListening"]);
        if(s.ContainsKey("voiceInputDevice"))voice.InputDeviceId=Convert.ToString(s["voiceInputDevice"]);
        if(s.ContainsKey("voiceOutputDevice"))voice.OutputDeviceId=Convert.ToString(s["voiceOutputDevice"]);
        if(s.ContainsKey("ttsVoice"))voice.VoiceId=Convert.ToString(s["ttsVoice"]);
        if(s.ContainsKey("ttsEngine"))voice.TtsEngine=Convert.ToString(s["ttsEngine"]);
        if(voice.TtsEngine!="windows"&&voice.TtsEngine!="kokoro")voice.TtsEngine="windows";
        if(s.ContainsKey("kokoroVoice"))voice.KokoroVoiceId=Convert.ToString(s["kokoroVoice"]);
        if(KokoroVoiceCatalog.Find(voice.KokoroVoiceId)==null)voice.KokoroVoiceId="zf_001";
        if(s.ContainsKey("speechSpeed"))voice.SpeechSpeed=Math.Max(.7,Math.Min(1.4,Convert.ToDouble(s["speechSpeed"],System.Globalization.CultureInfo.InvariantCulture)));
        if(s.ContainsKey("translucentBubble")) bubble.Opacity=Convert.ToBoolean(s["translucentBubble"]) ? 0.92 : 1;
        if(s.ContainsKey("appearanceId")) {
          try { ApplyAppearance(library.Load(Convert.ToString(s["appearanceId"]))); }
          catch { /* An unavailable custom image falls back to the built-in pet. */ }
        }
        if(s.ContainsKey("width")) { int w=Math.Max(144,Math.Min(384,Convert.ToInt32(s["width"]))); ClientSize=new System.Drawing.Size(w,w*208/192); Clamp(); }
        ReconcileArea();
      } } catch { /* Corrupt preferences must not prevent opening or closing the pet. */ }
    }
    void SavePetSettings() {
      try { Directory.CreateDirectory(Path.GetDirectoryName(settingsFile)); File.WriteAllText(settingsFile,Json.Encode(new { topMost=TopMost,animate=animate,variety=variety,followPointer=followPointer,wanderEnabled=wander.Enabled,wanderArea=new{x=wander.Area.X,y=wander.Area.Y,width=wander.Area.Width,height=wander.Area.Height},showHistory=showHistory,voiceReply=voiceReply,voiceListening=voiceListening,voiceInputDevice=voice.InputDeviceId,voiceOutputDevice=voice.OutputDeviceId,ttsVoice=voice.VoiceId,ttsEngine=voice.TtsEngine,kokoroVoice=voice.KokoroVoiceId,speechSpeed=voice.SpeechSpeed,translucentBubble=bubble.Opacity<1,width=Width,appearanceId=appearance.Id })); }
      catch(Exception e) { ShowText("設定已套用，但無法保存："+e.Message); }
    }
    void SetTopMost(bool value) { TopMost=value; bubble.TopMost=value; SavePetSettings(); }
    void SetAnimation(bool value) { animate=value; UpdateMotion(); Render(); SavePetSettings(); }
    void SetFollowPointer(bool value){followPointer=value;if(gesture=="look")gesture="";Render();SavePetSettings();}
    void SetTranslucent(bool value) { bubble.Opacity=value ? 0.92 : 1; translucentItem.Checked=value; SavePetSettings(); }
    void SetHistory(bool value) { showHistory=value; ArmMessageExpiry(); historyItem.Checked=value; RenderConversation(); SavePetSettings(); }
    void RenderConversation(bool animateReply=false) {
      if(replyStreamId.Length>0 && !animateReply) {
        streamPrefix=showHistory ? String.Join("\n\n",conversation.ToArray())+"\n\n"+petName+"：" : "";
        bubble.Say(streamPrefix+streamText); if(showHistory) bubble.ScrollToEnd(); PositionBubble(); return;
      }
      string text=showHistory && conversation.Count>0 ? String.Join("\n\n",conversation.ToArray()) : fullText;
      if(animateReply) bubble.SayAnimated(text,Math.Max(0,text.Length-fullText.Length));
      else { bubble.Say(text); if(showHistory) bubble.ScrollToEnd(); }
      PositionBubble();
    }
    void StartReplyStream(string id) {
      replyStreamId=id; streamText="";
      speechStreamId="";speechPending="";if(voiceReply&&id.Length>0){speechStreamId=id;voice.BeginResponseSpeech();}
      streamPrefix=showHistory ? String.Join("\n\n",conversation.ToArray())+"\n\n"+petName+"：" : "";
      bubble.Say(streamPrefix);
      if(!bubble.Visible) bubble.Show(this);
      if(showHistory) bubble.ScrollToEnd();
    }
    void CompleteReply(string text,string id,bool read=true) {
      // Generation/document progress owns the processing animation.  A normal
      // completion event must always release it, including non-streamed image
      // replies which never receive reply_start/reply_delta events.
      backendProcessing=false;activity="rest";
      bool streamed=read&&FinishStreamSpeech(id);
      if(!read&&id==speechStreamId){speechStreamId="";speechPending="";voice.StopSpeaking();}
      if(read&&!streamed)ReadReply(text,id);
      if(id.Length>0 && id==completedStreamId) return;
      bool changed=text!=fullText || id.Length>0;
      if(id.Length>0 && id==replyStreamId) {
        fullText=text; conversation.Add(petName+"："+text);
        bubble.ContinueReveal(streamPrefix+text); PositionBubble();
        replyStreamId=""; completedStreamId=id;
      } else if(text!=fullText || id.Length>0) {
        ShowText(text,false); completedStreamId=id;
      }
      if(changed)ArmMessageExpiry();
      if(changed&&!busy)PlayGesture("review",2);
    }
    void QueueStreamSpeech(string delta){if(!voiceReply||speechStreamId.Length==0)return;foreach(string part in SpeechChunker.Push(ref speechPending,delta,false))voice.QueueResponseSpeech(part);}
    bool FinishStreamSpeech(string id){if(id.Length==0||id!=speechStreamId)return false;foreach(string part in SpeechChunker.Push(ref speechPending,"",true))voice.QueueResponseSpeech(part);voice.EndResponseSpeech();lastReadReplyId=id;lastReadText=streamText;lastReadAt=DateTime.UtcNow;speechStreamId="";speechPending="";return true;}
    void ReadReply(string text,string id){if(!voiceReply||String.IsNullOrWhiteSpace(text))return;if(id.Length>0&&id==lastReadReplyId)return;if(id.Length==0&&text==lastReadText&&(DateTime.UtcNow-lastReadAt).TotalSeconds<3)return;try{voice.Say(text);lastReadReplyId=id;lastReadText=text;lastReadAt=DateTime.UtcNow;}catch(Exception e){bubble.Say(text+"\n語音輸出失敗："+e.Message);}}
    void SetListening(bool enabled,bool announce=true){
      if(enabled&&!voiceModuleEnabled){ShowText("語音模組已停用。");return;}
      try{if(enabled){voice.WakeName=petName;voice.RequireWakeName=false;voice.Start();voiceListening=true;SavePetSettings();if(announce)ShowHint("麥克風已開啟，可以直接說問題，也可以先叫「"+petName+"」。說「關閉麥克風」可停止聆聽。");}else{voice.Stop();voiceListening=false;SavePetSettings();if(announce)ShowHint("麥克風已關閉。");}}
      catch(Exception e){voiceListening=false;SavePetSettings();ShowText("無法開啟語音："+e.Message,false);}
    }
    async Task TestMicrophone(){if(!voiceModuleEnabled){ShowText("語音模組已停用。");return;}try{ShowText("接下來三秒請對著麥克風說話…",false);await Task.Delay(700);var level=await voice.MeasureInput();string result=level.Peak<.01?"幾乎沒有收到聲音，請檢查麥克風音量或裝置選擇。":level.Peak>.98?"有收到聲音，但音量已經削波，請把麥克風增益調低。":"有正常收到聲音。";ShowText(result+" 峰值 "+Math.Round(level.Peak*100)+"%，平均 "+Math.Round(level.RmsDb,1)+" dBFS。",false);}catch(Exception e){ShowText("麥克風測試失敗："+e.GetBaseException().Message,false);}}
    void ChangeSize(int delta) { int w=Math.Max(144,Math.Min(384,Width+delta)); ClientSize=new System.Drawing.Size(w,w*208/192); ReconcileArea();Clamp(); PositionBubble(); Render(); SavePetSettings(); }
    async Task QuitAgent() {
      if(exiting) return;
      exiting=true; quitItem.Enabled=false; bubble.Input.Enabled=false;
      ShowText("正在保存記憶並停止背景服務…");
      try {
        var result=await api.Call("shutdown",new {});
        if(!result.ContainsKey("stopped") || !Convert.ToBoolean(result["stopped"])) throw new Exception("後端尚未確認停止，請稍後重試。");
        if(shutdownConfirmed!=null) shutdownConfirmed();
        Close();
      } catch(Exception e) {
        if(!IsDisposed) { exiting=false; quitItem.Enabled=true; bubble.Input.Enabled=!busy;
          ShowText("無法確認背景服務已停止："+e.Message+"\n可右鍵重試，或選「僅關閉桌寵」。"); }
      }
    }
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams { get { var c=base.CreateParams; c.ExStyle|=0x80000|0x80|0x08000000; return c; } }
    public Bitmap Frame() {
      var bitmap=new Bitmap(Width,Height,PixelFormat.Format32bppPArgb);
      using(var g=Graphics.FromImage(bitmap)) { g.Clear(Color.Transparent); g.InterpolationMode=InterpolationMode.NearestNeighbor;
        if(!appearance.Animated) {
          float scale=Math.Min((float)Width/appearance.Image.Width,(float)Height/appearance.Image.Height);
          int w=Math.Max(1,(int)(appearance.Image.Width*scale)),h=Math.Max(1,(int)(appearance.Image.Height*scale));
          g.InterpolationMode=InterpolationMode.HighQualityBicubic; g.PixelOffsetMode=PixelOffsetMode.HighQuality;
          g.DrawImage(appearance.Image,new Rectangle((Width-w)/2,(Height-h)/2,w,h)); return bitmap;
        }
        int row=animate?AnimationRow():0;
        int column=animate ? phase%PetAnimations.Counts[row] : appearance.NeutralColumn;
        if(animate&&gesture=="look"&&Clock<gestureUntil&&!busy&&!backendProcessing&&replyStreamId.Length==0&&!dragging){int direction=(lookDirection+phase)%16;row=9+direction/8;column=direction%8;}
        if(animate&&followPointer && row==0) { int direction=PetAnimations.LookDirection(Cursor.Position,new Point(Left+Width/2,Top+Height/3));row=9+direction/8;column=direction%8; }
        int cw=appearance.CellWidth,ch=appearance.CellHeight;
        g.DrawImage(appearance.Image,new Rectangle(0,0,Width,Height),new Rectangle(column*cw,row*ch,cw,ch),GraphicsUnit.Pixel); }
      return bitmap;
    }
    public void Render() {
      if(!IsHandleCreated || IsDisposed) return;
      Bitmap image=Frame(); var old=current; current=image; if(old!=null) old.Dispose();
      IntPtr screen=Native.GetDC(IntPtr.Zero),dc=Native.CreateCompatibleDC(screen),bitmap=IntPtr.Zero,previous=IntPtr.Zero;
      try { bitmap=image.GetHbitmap(Color.FromArgb(0)); previous=Native.SelectObject(dc,bitmap);
        var pos=new Native.Point(Left,Top); var origin=new Native.Point(0,0); var size=new Native.Size(Width,Height);
        var blend=new Native.Blend { Op=0,Flags=0,Alpha=255,Format=1 };
        if(!Native.UpdateLayeredWindow(Handle,screen,ref pos,ref size,dc,ref origin,0,ref blend,2)) throw new System.ComponentModel.Win32Exception();
      } finally { if(previous!=IntPtr.Zero) Native.SelectObject(dc,previous); if(bitmap!=IntPtr.Zero) Native.DeleteObject(bitmap); Native.DeleteDC(dc); Native.ReleaseDC(IntPtr.Zero,screen); }
    }
    protected override void OnMouseDown(MouseEventArgs e) { if(e.Button==MouseButtons.Left) { wander.Pause(Clock);gesture="";dragging=true; moved=false; dragStart=Cursor.Position; original=Location; Capture=true; } base.OnMouseDown(e); }
    protected override void OnMouseMove(MouseEventArgs e) { if(dragging) { Point p=Cursor.Position; int x=p.X-dragStart.X,y=p.Y-dragStart.Y; if(Math.Abs(x)+Math.Abs(y)>4) moved=true; if(moved) { Location=new Point(original.X+x,original.Y+y); if(wander.Enabled)Clamp(); Render(); } } base.OnMouseMove(e); }
    protected override void OnMouseUp(MouseEventArgs e) { if(e.Button==MouseButtons.Left && dragging) { dragging=false; Capture=false; Clamp(); Render();
      if(moved) { Directory.CreateDirectory(Path.GetDirectoryName(positionFile)); File.WriteAllText(positionFile,Json.Encode(new { x=Left,y=Top })); }
      else { OpenBubbleForInput(); }
      PlayGesture(moved?"jumping":"waving",1.5);
    } else if(e.Button==MouseButtons.Right && !dragging) { petMenu.Show(this,e.Location); }
      base.OnMouseUp(e); }
    protected override void OnMouseCaptureChanged(EventArgs e) {
      if(!Capture) dragging=false;
      base.OnMouseCaptureChanged(e);
    }
    void OpenBubbleForInput() {
      if(!bubble.Visible&&!showHistory&&!busy&&replyStreamId.Length==0){fullText="";bubble.Say("");bubble.SetGeneratedImage(null);}
      // Show(owner) throws when a Form is already visible; activating is sufficient.
      PositionBubble();
      if(!bubble.Visible) bubble.Show(this);
      bubble.Activate(); bubble.Input.Focus();
    }
    void Clamp() { if(wander.Enabled&&PetWander.Fits(wander.Area,Size)){Location=PetWander.Constrain(Location,wander.Area,Size);return;}Rectangle a=Screen.FromPoint(Location).WorkingArea; Location=new Point(Math.Max(a.Left,Math.Min(Left,a.Right-Width)),Math.Max(a.Top,Math.Min(Top,a.Bottom-Height+28))); }
    void PointBubble() { if(placement!=null) bubble.PointAt(placement.Side,new Point(Left+Width/2,Top+Height/5)); }
    void PositionBubble() {
      if(bubble==null || bubble.IsDisposed) return;
      bubble.ResizeBubble(bubble.Expanded);
      var next=BubblePlacement.Calculate(Bounds,bubble.Size,Screen.FromRectangle(Bounds).WorkingArea);
      if(placement!=null && placement.Location==next.Location && placement.Side==next.Side) { PointBubble(); return; }
      placement=next;
      if(!bubble.Visible) { bubbleMotion.Stop(); bubble.Location=placement.Location; PointBubble(); return; }
      bubbleStart=bubble.Location; bubbleMoveStart=DateTime.UtcNow; PointBubble(); bubbleMotion.Start();
    }
    void ShowText(string text,bool read=true) { fullText=text; conversation.Add(petName+"："+text); RenderConversation(true); if(!bubble.Visible) bubble.Show(this); if(read)ReadReply(text,""); }
    void ShowHint(string text){ShowText(text,false);}
    void Event(Dictionary<string,object> data) {
      if(IsDisposed || !IsHandleCreated || exiting) return;
      try { BeginInvoke((Action)delegate {
        if(IsDisposed || exiting) return;
        string type=Json.Text(data,"type");
        if(Json.Text(data,"target_device").Length>0)return;
        string id=Json.Text(data,"stream_id");
        if(type=="generation_progress"&&busy){string status=Json.Text(data,"text");if(status.Length>0)bubble.Say(status);backendProcessing=true;activity="thinking";Render();return;}
        if(type=="generated_image"){ShowGeneratedImageFile(Json.Text(data,"file"));return;}
        if(type=="document_progress" && busy) {
          string stage=Json.Text(data,"stage");
          if(stage=="ocr") bubble.Say("正在辨識掃描文件，第 "+Json.Text(data,"page")+" / "+Json.Text(data,"total")+" 頁…");
          else if(stage=="semantic") bubble.Say("正在建立本機語意索引，"+Json.Text(data,"part")+" / "+Json.Text(data,"total")+" 段…");
          else bubble.Say((stage=="combine" ? "正在合併全文重點" : "正在逐段閱讀文件")+"，第 "+Json.Text(data,"part")+" / "+Json.Text(data,"total")+" 段…");
          return;
        }
        if(type=="reply_start" && id!=completedStreamId) { StartReplyStream(id); return; }
        if(type=="reply_delta" && id!=completedStreamId) {
          if(replyStreamId!=id) StartReplyStream(id);
          string delta=Json.Text(data,"delta");streamText+=delta;QueueStreamSpeech(delta); bubble.ContinueReveal(streamPrefix+streamText); return;
        }
        if(type=="reply_tool" && id==replyStreamId) { bubble.Say("正在查找資料…"); return; }
        if(type=="reply_error" && id==replyStreamId) { replyStreamId="";if(id==speechStreamId){speechStreamId="";speechPending="";voice.StopSpeaking();}backendProcessing=false;activity="rest";completedStreamId=id; bubble.Say("這次回覆中斷了，可以再問一次。\n"+Json.Text(data,"message"));PlayGesture("failed",2);return; }
        if(type=="pet_bubble" || type=="message") { bool alert=PetAnimations.Row(Json.Text(data,"activity"))==6;bool autonomous=data.ContainsKey("autonomous")&&Convert.ToBoolean(data["autonomous"]);activity="rest";string text=Json.Text(data,type=="message" ? "content" : "text");CompleteReply(text,id,!autonomous);if(!busy&&alert)PlayGesture("waiting",3);Render(); }
        if(type=="pet_state") { activity=Json.Text(data,"activity");backendProcessing=PetAnimations.Row(activity)==7;gesture="";wander.Pause(Clock);if(!backendProcessing){activity="rest";if(PetAnimations.Row(Json.Text(data,"activity"))==6)PlayGesture("waiting",3);}motion.Interval=PetAnimations.Interval(AnimationRow());Render(); }
      }); } catch(InvalidOperationException) {}
    }
    async void Submit(string text) {
      if(exiting) return;
      if(Regex.IsMatch(text,"^(?:請)?(?:停止朗讀|停止說話|安靜)$")){voice.StopSpeaking();return;}
      if(busy || preparingImage) { bubble.Input.Text=text; return; }
      string command=Regex.Replace(text,"[，,。！!？?\\s]","");
      command=Regex.Replace(command,"^(?:"+Regex.Escape(petName)+"|小日)?(?:可以)?(?:請|幫我)?","");
      command=Regex.Replace(command,"(?:好嗎|嗎)$","");
      if(command=="框選活動區域"||command=="設定活動區域"){BeginSelectArea();return;}
      if(command=="自由走動"||command=="開始走動"){SetWandering(true);return;}
      if(command=="停止走動"||command=="留在原地"){SetWandering(false);return;}
      if(command=="開啟自主動作"||command=="關閉自主動作"){variety=command=="開啟自主動作";gesture="";nextGesture=Clock+5;SavePetSettings();return;}
      string action=command=="揮手"||command=="打招呼"?"waving":command=="跳一下"||command=="跳一跳"?"jumping":command=="左右張望"||command=="四處看看"?"look":"";
      if(action.Length>0){PlayGesture(action,action=="look"?4:3);return;}
      if(command=="測試語音播放"||command=="測試喇叭"){TestVoiceOutput();return;}
      if(command=="測試麥克風"||command=="測試收音"){await TestMicrophone();return;}
      if(command=="語速快一點"||command=="說快一點"){SetSpeechSpeed(voice.SpeechSpeed+.1);return;}
      if(command=="語速慢一點"||command=="說慢一點"){SetSpeechSpeed(voice.SpeechSpeed-.1);return;}
      if(command=="語速正常"||command=="恢復正常語速"){SetSpeechSpeed(1);return;}
      var speedMatch=Regex.Match(command,"^(?:說話)?語速(?:調成|設成|改成)?([01](?:\\.\\d{1,2})?)(?:倍|x|×)?$",RegexOptions.IgnoreCase);
      if(speedMatch.Success){double speed;if(Double.TryParse(speedMatch.Groups[1].Value,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out speed)){SetSpeechSpeed(speed);return;}}
      if(command.Equals("使用Kokoro語音",StringComparison.OrdinalIgnoreCase)||command=="切換Kokoro語音"){try{voice.SelectTtsEngine("kokoro");SavePetSettings();if(voiceReply)await WarmVoice(true);else ShowText("已切換到 Kokoro。本機語音會在開啟語音回覆時暖機。");}catch(Exception e){ShowText("無法切換 Kokoro："+e.GetBaseException().Message);}return;}
      if(command=="使用Windows語音"||command=="切換Windows語音"){voice.SelectTtsEngine("windows");SavePetSettings();ShowText("已切換到 Windows TTS。");return;}
      var kokoroMatch=Regex.Match(command,"^(?:使用|切換)(zf_\\d{3}|zm_\\d{3}|af_maple|af_sol|bf_vale)(?:聲線|語音)?$",RegexOptions.IgnoreCase);
      if(kokoroMatch.Success){try{voice.SelectKokoroVoice(kokoroMatch.Groups[1].Value.ToLowerInvariant());voice.SelectTtsEngine("kokoro");SavePetSettings();if(voiceReply)await WarmVoice(true);else ShowText("已選擇 "+voice.KokoroVoiceId+"。說「測試語音播放」可以試聽。");}catch(Exception e){ShowText("無法切換 Kokoro 聲線："+e.GetBaseException().Message);}return;}
      if(command=="開啟語音" || command=="開始聆聽" || command=="開啟麥克風"){SetListening(true);return;}
      if(command=="傳送外觀到手機" || command=="把寵物傳到手機"){await TransferAppearance();return;}
      if(command=="儲存剛才的圖片"||command=="儲存剛剛的圖片"||command=="另存剛才的圖片"||command=="保存剛才的圖片"){SaveGeneratedImage();return;}
      if(command=="設定" || command=="功能與設定" || command=="模組管理器" || command=="打開設定"){OpenFeatureManager();return;}
      if(command=="連接PocketDrop" || command=="連接 PocketDrop" || command=="PocketDrop設定" || command=="PocketDrop 設定"){api.OpenPocketDrop();ShowText("PocketDrop 配對頁已打開，請選取邀請 QR 圖片。");return;}
      if(command=="打開記憶宮殿" || command=="開啟記憶宮殿" || command=="打開記憶書架" || command=="開啟記憶書架"){api.OpenPalace();ShowText("記憶宮殿已打開，可以搜尋主題和閱讀原始對話。");return;}
      if(command=="開啟通知提醒"){try{await notifications.Start();ShowText("通知提醒已開啟，只提示來源程式，不讀取通知內文。");}catch(Exception e){ShowText("通知提醒尚未啟用："+e.Message+"\n若 Windows 要求套件身分，請先依 desktop/notification-package/README.md 安裝通知身分套件。");}return;}
      if(command=="關閉通知提醒"){notifications.Stop();try{await api.Call("notification",new {clear=true});}catch{}ShowText("通知提醒已關閉。");return;}
      if(command=="關閉語音" || command=="停止聆聽" || command=="關閉麥克風"){SetListening(false);return;}
      if(command=="開啟語音回覆" || command=="關閉語音回覆"){await SetVoiceReply(command=="開啟語音回覆");return;}
      if(command=="移除圖片" || command=="取消圖片" || command=="移除文件" || command=="取消文件" || command=="取消附件") { ClearImage(); return; }
      if(command=="泡泡半透明" || command=="開啟半透明泡泡") { SetTranslucent(true); return; }
      if(command=="泡泡不透明" || command=="關閉半透明泡泡") { SetTranslucent(false); return; }
      if(command=="更換寵物形象" || command=="載入寵物形象") { await PickAppearance(); return; }
      if(command=="寵物外觀編輯器" || command=="編輯寵物外觀") { EditAppearance(); return; }
      if(command=="換回露米" || command=="使用內建露米") { SelectAppearance("lumi"); return; }
      if(command=="顯示歷史對話" || command=="開啟歷史對話") { SetHistory(true); return; }
      if(command=="隱藏歷史對話" || command=="關閉歷史對話") { SetHistory(false); return; }
      if(Regex.IsMatch(command,"^(?:請)?(?:詳細|看詳細|查看詳細|展開對話|展開聊天)$")) { bubble.ResizeBubble(true); RenderConversation(); return; }
      if(Regex.IsMatch(command,"^(?:請)?(?:縮小對話|縮小聊天|回到泡泡)$")) { bubble.ResizeBubble(false); RenderConversation(); return; }
      if(Regex.IsMatch(command,"^(?:請)?(?:收起對話|隱藏對話|收起泡泡)$")) { bubble.Hide(); return; }
      if(Regex.IsMatch(command,"^(?:請)?(?:不要置頂|取消置頂)$")) { SetTopMost(false); ShowText("好，我不置頂了。"); return; }
      if(Regex.IsMatch(command,"^(?:請)?(?:保持置頂|置頂)$")) { SetTopMost(true); ShowText("好，我會留在其他視窗上面。"); return; }
      if(command=="停止動畫" || command=="暫停動作") { SetAnimation(false); ShowText("好，我安靜站著。"); return; }
      if(command=="恢復動畫" || command=="恢復動作") { SetAnimation(true); ShowText("好。"); return; }
      if(command=="看著滑鼠" || command=="跟著滑鼠看"||command=="開啟滑鼠視線跟隨") { SetFollowPointer(true);ShowText("好，我跟著你的滑鼠看。");return; }
      if(command=="不要看滑鼠" || command=="停止跟隨滑鼠"||command=="關閉滑鼠視線跟隨") { SetFollowPointer(false);ShowText("好。");return; }
      if(command=="變大一點" || command=="變小一點") { ChangeSize(command=="變大一點" ? 48 : -48); ShowText("這樣可以嗎？"); return; }
      if(command=="對話紀錄" || command=="查看對話紀錄") { SetHistory(true); return; }
      if(command=="關閉桌寵" || command=="退出桌寵" || command=="關閉"+petName) { exitTask=QuitAgent(); return; }
      if(generatedImage!=null){var oldGenerated=generatedImage;generatedImage=null;bubble.SetGeneratedImage(null);oldGenerated.Dispose();PositionBubble();}
      var attached=pendingImage;
      var document=pendingDocument;
      bool answered=false;
      busy=true; bubble.Input.Enabled=false; conversation.Add("你："+text+(document!=null ? " ["+document.Name+"]" : attached==null ? "" : " [圖片]")); bubble.Say(document!=null ? "讓我讀一下這份文件…" : attached==null ? "讓我想想…" : "讓我看看這張圖片…"); activity="reading"; motion.Interval=180;
      try {
        Dictionary<string,object> result;
        result=await api.Call("chat",new { text=text,image=attached==null ? null : attached.Base64,document=document==null ? null : new {name=document.Name,data=document.Base64} });
        if(!IsDisposed && attached!=null && pendingImage==attached) { pendingImage=null; clearImageItem.Visible=false; bubble.SetAttachment(null); attached.Dispose(); PositionBubble(); }
        if(!IsDisposed && document!=null && pendingDocument==document) {pendingDocument=null;clearImageItem.Visible=false;bubble.SetDocument(null);document.Dispose();PositionBubble();}
        string generated=Json.Text(result,"image");
        if(generated.Length>0&&!exiting&&!IsDisposed&&Path.GetFileName(generatedImagePath)!=Json.Text(result,"image_name")){
          var next=ChatImage.FromBase64(generated,Json.Text(result,"image_name"));var previous=generatedImage;generatedImage=next;
          string dir=Path.Combine(projectRoot,"daily-agent","data","generated-images");Directory.CreateDirectory(dir);
          generatedImagePath=Path.Combine(dir,Path.GetFileName(next.Name));File.WriteAllBytes(generatedImagePath,Convert.FromBase64String(generated));
          bubble.SetGeneratedImage(next);if(previous!=null)previous.Dispose();PositionBubble();
        }
        string response=Json.Text(result,"content"); if(!exiting && !IsDisposed) {CompleteReply(response,Json.Text(result,"stream_id"));answered=true;}
      } catch(Exception e) { if(!exiting && !IsDisposed) { replyStreamId=""; bubble.Input.Text=text; ShowText("這次沒能完成："+e.Message); } }
      finally { busy=false; backendProcessing=false; if(!exiting && !IsDisposed) { bubble.Input.Enabled=true; activity="rest";PlayGesture(answered?"review":"failed",2);motion.Interval=250; Render(); if(bubble.ContainsFocus) bubble.Input.Focus(); } }
    }
    public async Task AmbientTest(string output){
      var checks=new List<string>();Directory.CreateDirectory(output);
      try{
        animate=true;variety=true;followPointer=true;wander.Enabled=false;busy=false;backendProcessing=false;replyStreamId="";activity="rest";gesture="";ambientGestures.Clear();lastGesture="";
        bubble.Activate();bubble.Input.Focus();if(!bubble.Input.Focused)throw new Exception("Test requires focused chat input");
        lastInputAt=Clock-20;nextGesture=Clock;UpdateMotion();behavior.Start();var seen=new HashSet<string>();
        if(Array.IndexOf(PetAnimations.AmbientNames,"look")>=0)throw new Exception("Directional look must not be an automatic action");
        for(int n=0;n<PetAnimations.AmbientNames.Length;n++){
          for(int i=0;i<30&&gesture.Length==0;i++)await Task.Delay(100);
          if(gesture.Length==0)throw new Exception("Focused empty input prevented ambient action");
          if(Array.IndexOf(PetAnimations.AmbientNames,gesture)<0)throw new Exception("Task state appeared as ambient action");
          seen.Add(gesture);int startPhase=phase;await Task.Delay(650);if(phase==startPhase)throw new Exception("Animation timer did not advance frames");gesture="";nextGesture=Clock;
        }
        if(seen.Count!=PetAnimations.AmbientNames.Length)throw new Exception("Ambient deck did not rotate through all playful actions");checks.Add("real-winforms-timers-focused-input-rotate-wave-jump-without-directional-look");
        PlayGesture("waving",4);busy=true;await Task.Delay(650);if(AnimationRow()!=7||gesture.Length>0)throw new Exception("Processing did not own animation");busy=false;
        PlayGesture("look",4);backendProcessing=true;await Task.Delay(650);if(AnimationRow()!=7||gesture.Length>0)throw new Exception("Background lookup did not own animation");backendProcessing=false;checks.Add("processing-exclusive-no-random-task-states");
        bubble.Input.Text="正在輸入";await Task.Delay(650);if(gesture.Length>0)throw new Exception("Typing did not pause ambient action");bubble.Input.Text="";checks.Add("recent-typing-pauses-but-focus-alone-does-not");
        SetFollowPointer(true);followPointer=false;LoadPetSettings();if(!followPointer)throw new Exception("Pointer setting not restored");
        for(int i=0;i<16;i++){double a=i*Math.PI/8;Point cursor=new Point((int)Math.Round(Math.Sin(a)*1000),(int)Math.Round(-Math.Cos(a)*1000));if(PetAnimations.LookDirection(cursor,Point.Empty)!=i)throw new Exception("Incorrect pointer direction "+i);}checks.Add("pointer-setting-persistence-and-all-sixteen-directions");
        voice.InputDeviceId="missing-input-test";voice.OutputDeviceId="missing-output-test";voice.VoiceId="missing-voice-test";SavePetSettings();voice.InputDeviceId=voice.OutputDeviceId=voice.VoiceId="";LoadPetSettings();
        if(voice.InputDeviceId!="missing-input-test"||voice.OutputDeviceId!="missing-output-test"||voice.VoiceId!="missing-voice-test")throw new Exception("Audio settings not restored");
        foreach(bool input in new[]{true,false})using(var menu=new ToolStripMenuItem()){BuildAudioMenu(menu,input);if(((ToolStripMenuItem)menu.DropDownItems[0]).Checked)throw new Exception("Missing device incorrectly shows default selection");if(!menu.DropDownItems[menu.DropDownItems.Count-1].Text.Contains("未連接"))throw new Exception("Missing device state not shown");}
        using(var menu=new ToolStripMenuItem()){BuildVoiceMenu(menu);if(!menu.DropDownItems[menu.DropDownItems.Count-1].Text.Contains("無法使用"))throw new Exception("Missing voice state not shown");}
        voice.InputDeviceId=voice.OutputDeviceId=voice.VoiceId="";SavePetSettings();checks.Add("audio-device-and-voice-persistence-menus-and-disconnected-state");
        if(messageExpiry.Interval!=900000)throw new Exception("Message timeout must be fifteen minutes");
        bool savedHistory=showHistory;SetHistory(false);messageExpiry.Interval=80;ShowText("自動收起測試",false);await Task.Delay(240);if(bubble.Visible)throw new Exception("Message did not auto-hide");
        SetHistory(true);bubble.Show(this);await Task.Delay(240);if(!bubble.Visible)throw new Exception("History mode must stay visible");
        SetHistory(false);await Task.Delay(240);if(bubble.Visible)throw new Exception("Leaving history mode must rearm expiry");messageExpiry.Interval=900000;SetHistory(savedHistory);checks.Add("fifteen-minute-expiry-history-exemption-and-toggle-rearm");
        File.WriteAllText(Path.Combine(output,"native-ambient-test.json"),Json.Encode(new{passed=true,checks=checks,actions=seen}));
      }catch(Exception e){File.WriteAllText(Path.Combine(output,"native-ambient-test.json"),Json.Encode(new{passed=false,checks=checks,error=e.ToString()}));}finally{Close();}
    }
    public void BehaviorTest(string output){
      var checks=new List<string>();Directory.CreateDirectory(output);motion.Stop();behavior.Stop();
      try{
        Rectangle area=new Rectangle(-900,-300,700,550);Size size=new Size(192,208);
        ActivityAreaPicker.VerifyInput();checks.Add("selection-mouse-drag-escape-and-right-button-cancel");
        if(PetWander.Selection(new Point(40,80),new Point(-20,-30))!=new Rectangle(-20,-30,60,110))throw new Exception("Reverse selection failed");
        var engine=new PetWander(47){Area=area,Enabled=true};Point p=new Point(-850,-200);var directions=new HashSet<string>();int steps=0;
        for(int i=0;i<15000;i++){Point next=engine.Step(p,size,i*.04,false);if(!area.Contains(new Rectangle(next,size)))throw new Exception("Pet escaped area");if(next!=p)steps++;if(engine.Moving)directions.Add(engine.Activity);p=next;}
        if(steps<100||directions.Count!=2)throw new Exception("Both movement directions not exercised");checks.Add("600-seconds-bounded-travel-left-right-negative-monitor-origin");
        Point stopped=engine.Step(p,size,601,true);for(int i=0;i<100;i++)if(engine.Step(stopped,size,602+i,true)!=stopped||engine.Moving)throw new Exception("Pause moved pet");
        Point resumed=engine.Step(stopped,size,10000,false);if(Math.Abs(resumed.X-stopped.X)+Math.Abs(resumed.Y-stopped.Y)>8)throw new Exception("Resume jumped after long sleep");checks.Add("blocked-pause-and-sleep-resume-no-jump");
        engine.Area=new Rectangle(0,0,192,208);p=engine.Step(new Point(500,500),size,10001,false);if(p!=Point.Empty||engine.Moving)throw new Exception("Exact fit failed");
        engine.Area=new Rectangle(0,0,100,100);p=engine.Step(new Point(30,30),size,10002,false);if(p!=new Point(30,30)||engine.Moving)throw new Exception("Undersize moved pet");checks.Add("exact-fit-and-oversize-pet");
        PetLibrary.Validate(appearance.Image,true,true);if(appearance.NeutralColumn!=6)throw new Exception("Lumi neutral missing");checks.Add("original-lumi-all-required-frames-transparent-reserves-and-neutral");
        using(var bad=new Bitmap(1536,2288,PixelFormat.Format32bppPArgb)){bool rejected=false;try{PetLibrary.Validate(bad,true,true);}catch{rejected=true;}if(!rejected)throw new Exception("Empty atlas accepted");}
        using(var bad=new Bitmap(100,100,PixelFormat.Format32bppPArgb)){using(var g=Graphics.FromImage(bad))g.Clear(Color.White);bool rejected=false;try{PetLibrary.Validate(bad,false,true);}catch{rejected=true;}if(!rejected)throw new Exception("Opaque static accepted");}
        using(var bad=new Bitmap(appearance.Image)){using(var g=Graphics.FromImage(bad)){g.CompositingMode=CompositingMode.SourceCopy;g.FillRectangle(Brushes.Transparent,192,208,192,208);}bool rejected=false;try{PetLibrary.Validate(bad,true,true);}catch{rejected=true;}if(!rejected)throw new Exception("Missing walk frame accepted");}
        checks.Add("empty-opaque-and-incomplete-assets-rejected");
        var real=Screen.FromControl(this).WorkingArea;wander.Area=new Rectangle(real.Left,real.Top,Math.Min(real.Width,700),Math.Min(real.Height,550));wander.Enabled=true;SavePetSettings();Rectangle saved=wander.Area;wander.Enabled=false;wander.Area=Rectangle.Empty;LoadPetSettings();if(wander.Area!=saved||!wander.Enabled)throw new Exception("Area not restored");
        bubble.Show();Point at=Location;BehaviorTick();if(Location!=at||wander.Moving)throw new Exception("Chat did not pause travel");checks.Add("area-settings-persist-and-chat-pauses-travel");wander.Enabled=false;followPointer=false;busy=false;activity="rest";animate=true;
        using(var contact=new Bitmap(192*5,250*2))using(var g=Graphics.FromImage(contact)){
          g.Clear(Color.FromArgb(230,237,235));
          string[] states={"idle","running-right","running-left","waving","jumping","failed","waiting","running","review","look"};
          for(int i=0;i<states.Length;i++){gesture=states[i];gestureUntil=Clock+30;phase=0;int row=AnimationRow();if(row!=(i==9?9:i))throw new Exception("Animation routing failed: "+states[i]);using(var frame=Frame()){g.DrawImage(frame,new Rectangle((i%5)*192,(i/5)*250,192,208));}using(var font=new Font("Segoe UI",11))g.DrawString(states[i],font,Brushes.Black,(i%5)*192+8,(i/5)*250+214);}
          contact.Save(Path.Combine(output,"pet-actions.png"),ImageFormat.Png);
        }
        int[] occupied=PetLibrary.InspectCells(appearance.Image);for(int row=0;row<11;row++)for(int col=0;col<PetAnimations.Counts[row];col++)if(occupied[row*8+col]==0)throw new Exception("Blank rendered cell");
        checks.Add("all-nine-animation-rows-and-sixteen-look-cells");gesture="";phase=6;if(AnimationRow()!=0||phase%PetAnimations.Counts[0]!=0)throw new Exception("Neutral mixed into idle loop");checks.Add("six-frame-idle-neutral-separated");
        wander.Enabled=false;wander.Area=Rectangle.Empty;SavePetSettings();
        File.WriteAllText(Path.Combine(output,"native-behavior-test.json"),Json.Encode(new{passed=true,checks=checks,travelSteps=steps}));
      }catch(Exception e){File.WriteAllText(Path.Combine(output,"native-behavior-test.json"),Json.Encode(new{passed=false,checks=checks,error=e.ToString()}));}finally{Close();}
    }
    public void SelfTest(string output) {
      var placements=new List<object>();
      string speech="";if(SpeechChunker.Push(ref speech,"這是一段尚未完成",false).Count!=0)throw new Exception("Speech chunked before a sentence boundary");var spoken=SpeechChunker.Push(ref speech,"的句子。下一句",false);if(spoken.Count!=1||spoken[0]!="這是一段尚未完成的句子。"||speech!="下一句")throw new Exception("Speech sentence boundary failed");spoken=SpeechChunker.Push(ref speech,"完成",true);if(spoken.Count!=1||spoken[0]!="下一句完成"||speech.Length!=0)throw new Exception("Speech final flush failed");
      voice.SetSpeechSpeed(9);if(Math.Abs(voice.SpeechSpeed-1.4)>.001)throw new Exception("Speech speed upper bound failed");voice.SetSpeechSpeed(.1);if(Math.Abs(voice.SpeechSpeed-.7)>.001)throw new Exception("Speech speed lower bound failed");voice.SetSpeechSpeed(1.05);
      Rectangle[] areas={ new Rectangle(0,0,1920,1040),new Rectangle(-1920,-200,1920,1040) };
      foreach(Rectangle area in areas) {
        var cases=new [] {
          new Rectangle(area.Left+800,area.Top+600,192,208),
          new Rectangle(area.Left+800,area.Top,192,208),
          new Rectangle(area.Left,area.Top,192,208),
          new Rectangle(area.Right-192,area.Top,192,208),
          new Rectangle(area.Left,area.Top+600,192,208) };
        var sides=new [] { BubbleSide.Above,BubbleSide.Left,BubbleSide.Right,BubbleSide.Left,BubbleSide.Above };
        for(int i=0;i<cases.Length;i++) foreach(var size in new [] { new System.Drawing.Size(368,260),new System.Drawing.Size(540,480),new System.Drawing.Size(368,336),new System.Drawing.Size(540,556) }) {
          var result=BubblePlacement.Calculate(cases[i],size,area);
          if(result.Side!=sides[i] || !area.Contains(new Rectangle(result.Location,size)) || cases[i].IntersectsWith(new Rectangle(result.Location,size))) throw new Exception("Bubble placement failed: "+i);
          placements.Add(new { side=result.Side.ToString(),x=result.Location.X,y=result.Location.Y,width=size.Width });
        }
      }
      Directory.CreateDirectory(output); using(var b=Frame()) { if(b.GetPixel(0,0).A!=0) throw new Exception("Corner is opaque"); b.Save(Path.Combine(output,"native-pet-alpha.png"),ImageFormat.Png); }
      if(FormBorderStyle!=FormBorderStyle.None || ShowInTaskbar || bubble.HasButtons()) throw new Exception("Unexpected app chrome/buttons");
      bubble.Say("我在這裡，有什麼問題直接和我說。\n\n例如：今天天氣怎麼樣？"); bubble.Location=new Point(-30000,-30000); bubble.Show(); Application.DoEvents();
      foreach(Control c in bubble.Controls) { var handle=c.Handle; }
      using(var b=new Bitmap(bubble.Width,bubble.Height)) { bubble.DrawToBitmap(b,new Rectangle(0,0,b.Width,b.Height)); b.Save(Path.Combine(output,"native-dialog.png"),ImageFormat.Png); }
      using(var surface=new Bitmap(bubble.Width,bubble.Height)) using(var preview=new Bitmap(bubble.Width*2+24,bubble.Height)) {
        bubble.DrawToBitmap(surface,new Rectangle(0,0,surface.Width,surface.Height));
        using(var g=Graphics.FromImage(preview)) using(var attrs=new ImageAttributes()) {
          g.Clear(Color.FromArgb(35,42,54));
          for(int x=0;x<preview.Width;x+=54) using(var brush=new SolidBrush(x%108==0 ? Color.FromArgb(95,132,151) : Color.FromArgb(181,159,130))) g.FillRectangle(brush,x,55,38,preview.Height-85);
          var matrix=new ColorMatrix();matrix.Matrix33=0.92f;attrs.SetColorMatrix(matrix);
          for(int side=0;side<2;side++) {
            var state=g.Save();g.TranslateTransform(side*(bubble.Width+24),0);
            if(side==1)using(var background=new SolidBrush(Color.FromArgb(226,231,225)))g.FillRectangle(background,0,0,bubble.Width,bubble.Height);
            using(var shape=bubble.Shape())g.SetClip(shape);
            g.DrawImage(surface,new Rectangle(0,0,surface.Width,surface.Height),0,0,surface.Width,surface.Height,GraphicsUnit.Pixel,attrs);g.Restore(state);
          }
        }
        preview.Save(Path.Combine(output,"bubble-translucency-preview.png"),ImageFormat.Png);
      }
      foreach(var side in new [] { BubbleSide.Left,BubbleSide.Right }) {
        bubble.PointAt(side,new Point(bubble.Left+bubble.Width/2,bubble.Top+52));
        using(var b=new Bitmap(bubble.Width,bubble.Height)) { bubble.DrawToBitmap(b,new Rectangle(0,0,b.Width,b.Height)); b.Save(Path.Combine(output,"native-dialog-"+side.ToString().ToLowerInvariant()+".png"),ImageFormat.Png); }
      }
      bubble.ResizeBubble(true); bubble.PointAt(BubbleSide.Above,new Point(bubble.Left+bubble.Width/2,bubble.Bottom+20));
      bubble.Say("我們可以慢慢聊。\n\n這裡會放比較完整的回答、資料摘要，還有你想接著看的細節。\n\n想收回小泡泡時，直接說「回到泡泡」就好。");
      using(var b=new Bitmap(bubble.Width,bubble.Height)) {
        bubble.DrawToBitmap(b,new Rectangle(0,0,b.Width,b.Height));
        b.Save(Path.Combine(output,"native-dialog-expanded.png"),ImageFormat.Png);
      }
      using(var source=new Bitmap(128,128)) {
        using(var g=Graphics.FromImage(source)){g.Clear(Color.CadetBlue);g.FillEllipse(Brushes.White,24,24,80,80);}
        using(var generated=ChatImage.Prepare(source,"generated-test.png")) {
          bubble.SetGeneratedImage(generated);
          if(bubble.HasAttachment)throw new Exception("Generated preview was treated as an input attachment");
          using(var b=new Bitmap(bubble.Width,bubble.Height)){bubble.DrawToBitmap(b,new Rectangle(0,0,b.Width,b.Height));b.Save(Path.Combine(output,"native-generated-preview.png"),ImageFormat.Png);}
          bubble.SetGeneratedImage(null);
        }
        string generatedFile=Path.Combine(output,"event-generated.png");source.Save(generatedFile,ImageFormat.Png);
        Event(new Dictionary<string,object>{{"type","generated_image"},{"file",generatedFile}});Application.DoEvents();
        if(generatedImagePath!=generatedFile||generatedImage==null||bubble.HasAttachment)throw new Exception("Generated image event did not install a clickable output preview");
      }
      File.WriteAllText(Path.Combine(output,"native-self-test.json"),Json.Encode(new { passed=true, perPixelAlpha=true, borderless=true, buttons=0, contextMenu=true, browserRuntime=false,placements=placements,moveDurationMs=180 }));
    }
    public async Task IntegrationTest(string output) {
      try {
        Directory.CreateDirectory(output);
        Submit("詳細"); if(!bubble.Expanded) throw new Exception("Natural detail command failed");
        Submit("回到泡泡"); if(bubble.Expanded) throw new Exception("Natural collapse command failed");
        Submit("會下雨嗎？");
        for(int i=0;i<300 && busy;i++) await Task.Delay(100);
        if(busy || !fullText.Contains("Open-Meteo")) throw new Exception("Weather conversation did not return: "+fullText);
        var status=await api.Call("status",null);
        if(Json.Text(status,"state")!="IDLE") throw new Exception("Weather woke Full Agent");
        if(bubble.HasButtons()) throw new Exception("Unexpected button");
        File.WriteAllText(Path.Combine(output,"native-integration.json"),Json.Encode(new { passed=true, weather=fullText, state=Json.Text(status,"state"), buttons=0, transparent=true }));
      } catch(Exception e) { File.WriteAllText(Path.Combine(output,"native-integration.json"),Json.Encode(new { passed=false,error=e.ToString() })); }
      finally { Close(); }
    }
    public async Task PointerTest(string output) {
      Directory.CreateDirectory(output);
      var checks=new List<string>();
      try {
        await bubble.VerifyTyping(); checks.Add("fast-typewriter-timer-unicode-cancel-history-hide");
        bubble.VerifyReplyScrolling(output); checks.Add("compact-full-reply-wheel-scroll-to-end-expand-collapse");
        for(int i=0;i<3;i++) {
          OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
          OnMouseUp(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
          if(!bubble.Visible) throw new Exception("Left click did not show bubble");
        }
        checks.Add("repeated-left-click");
        bubble.Hide();
        OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
        OnMouseUp(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
        if(!bubble.Visible) throw new Exception("Hidden bubble did not reopen");
        checks.Add("reopen-hidden-bubble");
        OnMouseDown(new MouseEventArgs(MouseButtons.Right,1,96,100,0));
        OnMouseUp(new MouseEventArgs(MouseButtons.Right,1,96,100,0));
        if(dragging || !petMenu.Visible) throw new Exception("Right click did not open menu");
        petMenu.Close(); checks.Add("right-click-menu");
        bool wasTop=TopMost, wasAnimated=animate;
        topItem.PerformClick(); animationItem.PerformClick();
        if(TopMost==wasTop || animate==wasAnimated) throw new Exception("Settings menu did not apply");
        LoadPetSettings();
        if(TopMost==wasTop || animate==wasAnimated) throw new Exception("Settings were not persisted");
        topItem.PerformClick(); animationItem.PerformClick(); checks.Add("settings-apply-and-persist");
        bool wasTranslucent=bubble.Opacity<1;
        translucentItem.PerformClick(); double opacity=bubble.Opacity;
        LoadPetSettings();
        if(bubble.Opacity!=opacity || (bubble.Opacity<1)==wasTranslucent || bubble.Font.Size<12 || bubble.Input.Font.Size<11) throw new Exception("Readability/translucency setting failed");
        SetTranslucent(wasTranslucent);checks.Add("readable-font-translucency-toggle-and-persist");
        bool originalHistory=showHistory;
        conversation.Add("你：歷史測試問題"); ShowText("歷史測試回答");
        SetHistory(false); historyItem.PerformClick();
        if(!showHistory || !bubble.CurrentText.Contains("你：歷史測試問題")) throw new Exception("History toggle did not display user turns");
        showHistory=false; LoadPetSettings();
        if(!showHistory) throw new Exception("History preference did not persist");
        int turns=conversation.Count; historyItem.PerformClick();
        if(showHistory || bubble.CurrentText!="歷史測試回答" || conversation.Count!=turns) throw new Exception("History hide changed conversation");
        SetHistory(originalHistory); checks.Add("history-toggle-persist-hide-without-delete");
        toggleBubbleItem.PerformClick(); if(bubble.Visible) throw new Exception("Menu did not hide bubble");
        toggleBubbleItem.PerformClick(); if(!bubble.Visible) throw new Exception("Menu did not show bubble");
        checks.Add("menu-toggle-bubble");
        OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
        OnMouseUp(new MouseEventArgs(MouseButtons.Right,1,96,100,0));
        if(!dragging) throw new Exception("Right release ended a left drag");
        Capture=false;
        if(dragging) throw new Exception("Capture loss left dragging active");
        checks.Add("mixed-buttons-and-capture-loss");
        Point previous=Location;
        OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
        dragStart=new Point(Cursor.Position.X-24,Cursor.Position.Y-12);
        OnMouseMove(new MouseEventArgs(MouseButtons.Left,0,120,112,0));
        if(Location==previous || !moved) throw new Exception("Drag did not move pet");
        OnMouseUp(new MouseEventArgs(MouseButtons.Left,1,120,112,0));
        if(dragging || Capture) throw new Exception("Drag did not release capture");
        if(!File.Exists(positionFile)) throw new Exception("Drag position was not saved");
        checks.Add("drag-and-save-position");
        for(int i=0;i<20;i++) {
          OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
          OnMouseUp(new MouseEventArgs(MouseButtons.Left,1,96,100,0));
        }
        checks.Add("twenty-clicks-after-drag");
        File.WriteAllText(Path.Combine(output,"native-pointer-test.json"),Json.Encode(new { passed=true,checks=checks }));
      } catch(Exception e) { File.WriteAllText(Path.Combine(output,"native-pointer-test.json"),Json.Encode(new { passed=false,checks=checks,error=e.ToString() })); }
      finally { Close(); }
    }
    public async Task ShutdownTest(string output) {
      Directory.CreateDirectory(output);
      shutdownConfirmed=delegate {
        File.WriteAllText(Path.Combine(output,"native-shutdown-test.json"),Json.Encode(new { passed=true, menuClick=true,backendConfirmedStopped=true }));
      };
      quitItem.PerformClick();
      await exitTask;
      if(!IsDisposed) {
        File.WriteAllText(Path.Combine(output,"native-shutdown-test.json"),Json.Encode(new { passed=false,error=fullText,retryEnabled=quitItem.Enabled }));
        Close();
      }
    }
    public async Task AppearanceTest(string output,string zipPath) {
      var checks=new List<string>(); Directory.CreateDirectory(output);
      try {
        string originalText="這段對話在更換外觀後仍然保留。";
        fullText=originalText; bubble.Say(originalText); conversation.Add("你：保留這段對話");
        int messages=conversation.Count;
        string png=Path.Combine(output,"自訂形象 alpha.png");
        using(var frame=Frame()) frame.Save(png,ImageFormat.Png);
        byte[] original=File.ReadAllBytes(png);
        await ImportAppearance(png);
        if(appearance.Animated || appearance.Id=="lumi" || motion.Enabled) throw new Exception("Static import or low-power rendering failed");
        using(var frame=Frame()) {
          if(frame.GetPixel(0,0).A!=0) throw new Exception("Static transparency was lost");
          frame.Save(Path.Combine(output,"imported-static.png"),ImageFormat.Png);
        }
        if(Convert.ToBase64String(original)!=Convert.ToBase64String(File.ReadAllBytes(png))) throw new Exception("Original input was modified");
        checks.Add("static-png-alpha-original-preserved-no-animation-timer");
        string staticId=appearance.Id;
        var saved=Json.Decode(File.ReadAllText(settingsFile));
        if(Json.Text(saved,"appearanceId")!=staticId) throw new Exception("Selected pet was not saved");
        SelectAppearance("lumi"); SelectAppearance(staticId);
        LoadPetSettings(); if(appearance.Id!=staticId) throw new Exception("Pet selection restore failed");
        if(fullText!=originalText || bubble.CurrentText!=originalText || conversation.Count!=messages) throw new Exception("Appearance switch changed chat");
        checks.Add("switch-restore-and-conversation-continuity");
        int count=library.List().Count;
        string bad=Path.Combine(output,"invalid.png"); File.WriteAllText(bad,"not an image");
        bool rejected=false; try { using(var invalid=library.Import(bad)) {} } catch { rejected=true; }
        if(!rejected || library.List().Count!=count || appearance.Id!=staticId) throw new Exception("Bad import was not isolated");
        checks.Add("invalid-image-preserves-current-and-library");
        string unsafeZip=Path.Combine(output,"unsafe-"+Guid.NewGuid().ToString("N")+".zip");
        using(var archive=System.IO.Compression.ZipFile.Open(unsafeZip,System.IO.Compression.ZipArchiveMode.Create)) {
          using(var writer=new StreamWriter(archive.CreateEntry("pet.json").Open())) writer.Write("{\"spriteVersionNumber\":2,\"spritesheetPath\":\"../outside.png\"}");
        }
        rejected=false; try { using(var invalid=library.Import(unsafeZip)) {} } catch { rejected=true; }
        if(!rejected || library.List().Count!=count) throw new Exception("Unsafe archive was accepted");
        checks.Add("zip-path-traversal-rejected");
        await ImportAppearance(zipPath);
        if(!appearance.Animated || appearance.Id==staticId || appearance.Id=="lumi") throw new Exception("Actual Lumi WebP ZIP failed: "+bubble.CurrentText);
        if(appearance.Image.Width!=1536 || appearance.Image.Height!=2288) throw new Exception("Atlas size changed");
        using(var frame=Frame()) frame.Save(Path.Combine(output,"imported-v2.png"),ImageFormat.Png);
        checks.Add("supplied-lumi-v2-webp-zip-import-and-render");
        RebuildAppearanceMenu();
        if(appearanceMenu.DropDownItems.Count!=6) throw new Exception("Imported pets missing from menu");
        if(fullText!=originalText || conversation.Count!=messages) throw new Exception("ZIP import changed chat");
        checks.Add("library-menu-and-chat-preserved");
        SelectAppearance("lumi");
        if(appearance.Id!="lumi") throw new Exception("Built-in fallback failed");
        checks.Add("return-to-built-in");
        File.WriteAllText(Path.Combine(output,"appearance-test.json"),Json.Encode(new {passed=true,checks=checks}));
      } catch(Exception e) { File.WriteAllText(Path.Combine(output,"appearance-test.json"),Json.Encode(new {passed=false,checks=checks,error=e.ToString()})); }
      finally { Close(); }
    }
    public async Task VisionTest(string output,string fixture) {
      var checks=new List<string>(); Directory.CreateDirectory(output);
      try {
        var before=await api.Call("status",null);
        if(Json.Text(before,"state")!="IDLE") throw new Exception("Vision test must start Idle");
        var data=new DataObject(DataFormats.FileDrop,new string[]{fixture});
        var drop=new DragEventArgs(data,0,0,0,DragDropEffects.Copy,DragDropEffects.None);
        ImageDragEnter(bubble,drop); if(drop.Effect!=DragDropEffects.Copy) throw new Exception("Image drag was rejected");
        ImageDrop(bubble,drop);
        for(int i=0;i<200 && preparingImage;i++) await Task.Delay(50);
        if(pendingImage==null || !bubble.HasAttachment) throw new Exception("File drop did not prepare preview");
        var staged=await api.Call("status",null);
        if(Json.Text(staged,"state")!="IDLE" || Convert.ToInt32(staged["workingTokens"])!=Convert.ToInt32(before["workingTokens"])) throw new Exception("Staging image invoked the agent");
        checks.Add("file-drop-previews-without-waking-or-sending");
        if(ReceiveImageData(new DataObject(DataFormats.UnicodeText,"普通文字"))) throw new Exception("Text paste was intercepted");
        var previous=pendingImage;
        ReceiveImageData(new DataObject(DataFormats.FileDrop,new string[]{fixture,fixture}));
        if(pendingImage!=previous) throw new Exception("Multiple file drop replaced pending image");
        checks.Add("text-paste-preserved-and-multiple-images-rejected");
        clearImageItem.PerformClick();
        if(pendingImage!=null || bubble.HasAttachment) throw new Exception("Remove image menu failed");
        using(var source=new Bitmap(fixture)) {
          if(!ReceiveImageData(new DataObject(DataFormats.Bitmap,source))) throw new Exception("Clipboard bitmap path rejected");
        }
        if(pendingImage==null) throw new Exception("Clipboard path did not prepare image");
        checks.Add("remove-and-clipboard-bitmap-path-without-touching-system-clipboard");
        string invalid=Path.Combine(output,"invalid.png"); File.WriteAllText(invalid,"not an image");
        previous=pendingImage; PrepareImageFile(invalid);
        for(int i=0;i<200 && preparingImage;i++) await Task.Delay(50);
        if(pendingImage!=previous || !bubble.Input.Enabled) throw new Exception("Bad file damaged attachment state");
        checks.Add("invalid-file-preserves-attachment-and-input");
        string largeJson=Json.Encode(new { image=new string('a',2500000) });
        if(largeJson.Length<2500000) throw new Exception("Large image JSON was truncated");
        checks.Add("large-payload-json-serialization");
        bubble.Say("圖片已放好，輸入問題後按 Enter。\n也可以直接貼上剪貼簿截圖。");
        using(var preview=new Bitmap(bubble.Width,bubble.Height)) { bubble.DrawToBitmap(preview,new Rectangle(0,0,preview.Width,preview.Height)); preview.Save(Path.Combine(output,"vision-pending.png"),ImageFormat.Png); }
        Submit("請讀取圖片中央的三位數字，只回答圖片上的數字。");
        for(int i=0;i<2800 && busy;i++) await Task.Delay(100);
        if(busy || !Regex.IsMatch(fullText,"427")) throw new Exception("Real vision failed: "+fullText);
        if(pendingImage!=null || bubble.HasAttachment) throw new Exception("Successful send left a stale attachment");
        var active=await api.Call("status",null);
        if(Json.Text(active,"state")!="ACTIVE") throw new Exception("Image did not wake Full Agent");
        checks.Add("real-qwen-vision-427-idle-to-active-and-clear-after-success");
        File.WriteAllText(Path.Combine(output,"native-vision-test.json"),Json.Encode(new {passed=true,checks=checks,answer=fullText,state=Json.Text(active,"state")}));
      } catch(Exception e) { File.WriteAllText(Path.Combine(output,"native-vision-test.json"),Json.Encode(new {passed=false,checks=checks,error=e.ToString()})); }
      finally { Close(); }
    }
    public async Task StreamingTest(string output) {
      Directory.CreateDirectory(output);
      try {
        for(int i=0;i<100 && !api.Listening;i++) await Task.Delay(100);
        if(!api.Listening) throw new Exception("SSE listener not ready");
        SetHistory(false);
        string before=fullText; int turns=conversation.Count;
        DateTime started=DateTime.UtcNow; double firstPreviewMs=0;
        bool sawPartial=false; int updates=0,lastLength=0;
        Submit("請用繁體中文寫一段約一百八十字的森林小故事，不使用工具，不加標題。");
        for(int i=0;i<2800 && busy;i++) {
          await Task.Delay(50);
          if(replyStreamId.Length>0 && streamText.Length>0 && fullText==before && bubble.CurrentText.Length>0) {
            if(streamText.Length>lastLength) { updates++; lastLength=streamText.Length; }
            if(!sawPartial) {
              sawPartial=true; firstPreviewMs=(DateTime.UtcNow-started).TotalMilliseconds;
              using(var preview=new Bitmap(bubble.Width,bubble.Height)) { bubble.DrawToBitmap(preview,new Rectangle(0,0,preview.Width,preview.Height)); preview.Save(Path.Combine(output,"stream-partial.png"),ImageFormat.Png); }
            }
          }
        }
        double completedMs=(DateTime.UtcNow-started).TotalMilliseconds;
        if(busy || !sawPartial || updates<2 || fullText.Length<30 || completedStreamId.Length==0) throw new Exception("No incremental native reply: busy="+busy+", partial="+sawPartial+", updates="+updates+", id="+completedStreamId+", chars="+fullText.Length+", streamChars="+streamText.Length);
        for(int i=0;i<500 && bubble.CurrentText!=fullText;i++) await Task.Delay(32);
        if(bubble.CurrentText!=fullText || conversation.Count!=turns+2) throw new Exception("Final reply duplicated or truncated");
        string visible=bubble.CurrentText;
        CompleteReply(fullText,completedStreamId);
        if(bubble.CurrentText!=visible || conversation.Count!=turns+2) throw new Exception("Duplicate completion replayed answer");
        using(var preview=new Bitmap(bubble.Width,bubble.Height)) { bubble.DrawToBitmap(preview,new Rectangle(0,0,preview.Width,preview.Height)); preview.Save(Path.Combine(output,"stream-complete.png"),ImageFormat.Png); }
        File.WriteAllText(Path.Combine(output,"native-stream-test.json"),Json.Encode(new {passed=true,firstPreviewMs=firstPreviewMs,completedMs=completedMs,updates=updates,characters=fullText.Length,streamId=completedStreamId,answer=fullText}));
      } catch(Exception e) { File.WriteAllText(Path.Combine(output,"native-stream-test.json"),Json.Encode(new {passed=false,error=e.ToString()})); }
      finally { Close(); }
    }
    public async Task DocumentTest(string output,string fixture,bool summarize=false) {
      Directory.CreateDirectory(output);var checks=new List<string>();
      try {
        for(int i=0;i<100 && !api.Listening;i++)await Task.Delay(100);
        string bad=Path.Combine(output,"bad.pdf");File.WriteAllText(bad,"not PDF");
        PrepareDocumentFile(bad);for(int i=0;i<100 && preparingImage;i++)await Task.Delay(50);
        if(pendingDocument==null)throw new Exception("Document staging failed");
        Submit("請摘要這份文件。");for(int i=0;i<600 && busy;i++)await Task.Delay(50);
        if(busy || pendingDocument==null || !fullText.Contains("PDF"))throw new Exception("Bad PDF did not preserve attachment");
        var invalidStatus=await api.Call("status",null);if(Json.Text(invalidStatus,"state")!="IDLE")throw new Exception("Bad PDF woke model");
        checks.Add("invalid-pdf-preserves-attachment-without-wake");
        ClearImage();
        var data=new DataObject(DataFormats.FileDrop,new string[]{fixture});
        var drop=new DragEventArgs(data,0,0,0,DragDropEffects.Copy,DragDropEffects.None);
        ImageDragEnter(bubble,drop);if(drop.Effect!=DragDropEffects.Copy)throw new Exception("PDF drag not accepted");
        ImageDrop(bubble,drop);for(int i=0;i<100 && preparingImage;i++)await Task.Delay(50);
        if(pendingDocument==null || !bubble.HasAttachment)throw new Exception("PDF preview missing");
        var status=await api.Call("status",null);if(Json.Text(status,"state")!="IDLE")throw new Exception("Staging woke model");
        using(var preview=new Bitmap(bubble.Width,bubble.Height)){bubble.DrawToBitmap(preview,new Rectangle(0,0,preview.Width,preview.Height));preview.Save(Path.Combine(output,"document-pending.png"),ImageFormat.Png);}
        checks.Add("pdf-drop-preview-without-wake");
        bool ocrProgressSeen=false,summaryProgressSeen=false;
        Submit(summarize ? "請完整摘要這份文件，列出開頭、中段和最後一頁的里程碑代碼、審查日期、核准預算，並標示頁碼。" : "文件第 2 頁的專案代碼是什麼？只回答代碼。");
        for(int i=0;i<6000 && busy;i++) {
          await Task.Delay(100);
          if(!summaryProgressSeen && bubble.CurrentText.Contains("逐段閱讀文件")) {
            summaryProgressSeen=true;
            using(var preview=new Bitmap(bubble.Width,bubble.Height)){bubble.DrawToBitmap(preview,new Rectangle(0,0,preview.Width,preview.Height));preview.Save(Path.Combine(output,"document-summary-progress.png"),ImageFormat.Png);}
          }
          if(!ocrProgressSeen && bubble.CurrentText.Contains("辨識掃描文件")) {
            ocrProgressSeen=true;
            using(var preview=new Bitmap(bubble.Width,bubble.Height)){bubble.DrawToBitmap(preview,new Rectangle(0,0,preview.Width,preview.Height));preview.Save(Path.Combine(output,"document-ocr-progress.png"),ImageFormat.Png);}
          }
        }
        bool expected=summarize ? fullText.Contains("START-214") && fullText.Contains("MID-582") && fullText.Contains("END-936") : fullText.Contains("LANTERN-742");
        if(busy || !expected || pendingDocument!=null)throw new Exception("PDF answer failed: "+fullText);
        string first=fullText;checks.Add("real-local-pdf-page-answer-and-clear-after-success");
        Submit("這份文件的審查日期是哪一天？只回答日期。");
        for(int i=0;i<2800 && busy;i++)await Task.Delay(100);
        if(busy || !fullText.Contains("2026") || !fullText.Contains(summarize ? "19" : "18"))throw new Exception("Follow-up lost document: "+fullText);
        checks.Add("follow-up-reuses-document-without-reattaching");
        File.WriteAllText(Path.Combine(output,"native-document-test.json"),Json.Encode(new {passed=true,checks=checks,answer=first,followup=fullText,ocrProgressSeen=ocrProgressSeen,summaryProgressSeen=summaryProgressSeen}));
      }catch(Exception e){File.WriteAllText(Path.Combine(output,"native-document-test.json"),Json.Encode(new {passed=false,checks=checks,error=e.ToString()}));}
      finally{Close();}
    }
  }
  static class Program {
    [STAThread] static int Main(string[] args) {
      AppDomain.CurrentDomain.UnhandledException+=delegate(object sender,UnhandledExceptionEventArgs e) { try { File.WriteAllText(RuntimePaths.Get(args[0],"native-pet-error.log"),Convert.ToString(e.ExceptionObject)); } catch {} };
      try {
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
        Native.SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        if(args.Length<2) throw new ArgumentException("Expected project root and localhost URL");
        if(args.Length>4&&args[2]=="--pet-import-test"){
          using(var test=new PetQuickImport(new PetLibrary(args[0],Path.Combine(args[3],"library")),false)){
            test.Shown+=async delegate{await test.SelfTest(args[0],args[3],args[4]);};Application.Run(test);
          }return 0;
        }
        if(args.Length>2&&args[2]=="--pet-quick-import"){
          using(var tool=new PetQuickImport(new PetLibrary(args[0]),false)){
            if(args.Length>3)tool.Shown+=async delegate{await tool.LoadSource(args[3]);};Application.Run(tool);
          }return 0;
        }
        if(args.Length>3&&args[2]=="--editor-test"){PetAppearanceEditor.SelfTest(args[0],args[3]);return 0;}
        if(args.Length>2&&args[2]=="--appearance-editor"){
          var library=new PetLibrary(args[0]);
          string selected="lumi";
          try{selected=Json.Text(Json.Decode(File.ReadAllText(RuntimePaths.Get(args[0],"native-pet","settings-"+new Uri(args[1]).Port+".json"))),"appearanceId");}catch{}
          PetAppearance current;
          try{current=library.Load(selected);}catch{current=library.Load("lumi");}
          using(var localApi=new Api(args[1]))using(current)using(var editor=new PetAppearanceEditor(library,current,true,localApi)){
            Application.Run(editor);if(editor.Saved!=null)editor.Saved.Dispose();
          }return 0;
        }
        string port=new Uri(args[1]).Port.ToString(); bool created;
        if(args.Length>2 && args[2]=="--exit") { try { EventWaitHandle.OpenExisting("Local\\DailyPetExit"+port).Set(); } catch(WaitHandleCannotBeOpenedException) {} return 0; }
        using(var mutex=new Mutex(true,"Local\\DailyPet"+port,out created)) {
          if(!created) return 0;
          bool appearanceTest=args.Length>4 && args[2]=="--appearance-test";
          using(var pet=new Pet(args[0],args[1],!appearanceTest && (args.Length<3 || (args[2]!="--self-test" && args[2]!="--pointer-test" && args[2]!="--behavior-test" && args[2]!="--ambient-test")),appearanceTest ? Path.Combine(args[3],"library") : null)) {
            if(args.Length>3&&args[2]=="--ambient-test")pet.Shown+=async delegate{await pet.AmbientTest(args[3]);};
            if(args.Length>3&&args[2]=="--behavior-test")pet.Shown+=delegate{pet.BehaviorTest(args[3]);};
            if(args.Length>3 && args[2]=="--self-test") pet.Shown+=delegate { try { pet.SelfTest(args[3]); } finally { pet.Close(); } };
            if(args.Length>3 && args[2]=="--integration-test") {
              pet.Shown+=async delegate { await pet.IntegrationTest(args[3]); };
            }
            if(args.Length>3 && args[2]=="--pointer-test") pet.Shown+=async delegate { await pet.PointerTest(args[3]); };
            if(args.Length>3 && args[2]=="--shutdown-test") pet.Shown+=async delegate { await pet.ShutdownTest(args[3]); };
            if(appearanceTest) pet.Shown+=async delegate { await pet.AppearanceTest(args[3],args[4]); };
            if(args.Length>4 && args[2]=="--vision-test") pet.Shown+=async delegate { await pet.VisionTest(args[3],args[4]); };
            if(args.Length>3 && args[2]=="--stream-test") pet.Shown+=async delegate { await pet.StreamingTest(args[3]); };
            if(args.Length>4 && args[2]=="--document-test") pet.Shown+=async delegate { await pet.DocumentTest(args[3],args[4],args.Length>5 && args[5]=="--summary"); };
            using(var exit=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\DailyPetExit"+port)) {
              var registration=ThreadPool.RegisterWaitForSingleObject(exit,delegate { try { pet.BeginInvoke((Action)delegate { pet.Close(); }); } catch(InvalidOperationException) {} },null,-1,true);
              Application.Run(pet); registration.Unregister(null);
            }
          }
        }
        return 0;
      } catch(Exception e) { try { File.WriteAllText(RuntimePaths.Get(args[0],"native-pet-error.log"),e.ToString()); } catch {} return 1; }
    }
  }
}
