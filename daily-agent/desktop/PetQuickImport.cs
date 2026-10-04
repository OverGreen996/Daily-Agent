using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace DailyPet {
  // PET output is already an atlas. Keep its bytes; share the native import gate.
  sealed class GeneratedPetSource {
    public string File, Entry, Label;
    public override string ToString(){return Label;}
    public string Filename {get{return Path.GetFileName(Entry ?? File);}}
  }
  sealed class GeneratedPetSelection : IDisposable {
    public GeneratedPetSource Source;
    public byte[] Bytes;
    public Bitmap Atlas;
    public string Sha256;
    public void Dispose(){if(Atlas!=null){Atlas.Dispose();Atlas=null;}}
  }
  static class GeneratedPetPack {
    const int MaxImage=32*1024*1024, MaxCandidates=64;
    static bool ImageFile(string file){string ext=Path.GetExtension(file).ToLowerInvariant();return ext==".png"||ext==".webp";}
    static bool AtlasName(string file){return Regex.IsMatch(Path.GetFileName(file),"spritesheet|sprite[._-]|^sprite\\.|atlas",RegexOptions.IgnoreCase);}
    static string SafeEntry(string name){
      string s=name.Replace('\\','/');
      if(s.StartsWith("/")||s.Contains(":"))throw new Exception("ZIP 含不安全路徑，請改選原始 outputs 資料夾。");
      foreach(string part in s.Split('/'))if(part==".."||part==".")throw new Exception("ZIP 含不安全路徑，請改選原始 outputs 資料夾。");
      return s;
    }
    static bool PngShape(Stream stream){
      byte[] header=new byte[24];int read=0,n;while(read<header.Length&&(n=stream.Read(header,read,header.Length-read))>0)read+=n;
      if(read<24||header[0]!=137||header[1]!=80||header[2]!=78||header[3]!=71)return false;
      long w=0,h=0;for(int i=16;i<20;i++)w=w*256+header[i];for(int i=20;i<24;i++)h=h*256+header[i];
      return w>=128&&h>=176&&w<=8192&&h<=8192&&w*h<=16777216&&w%8==0&&h%11==0&&(w/8)*13==(h/11)*12;
    }
    static void Add(List<GeneratedPetSource> list,GeneratedPetSource source){
      if(list.Count>=MaxCandidates)throw new Exception("找到超過 64 張圖集，請選較小的寵物資料夾。");list.Add(source);
    }
    public static List<GeneratedPetSource> Scan(string input){
      string path=Path.GetFullPath(input);var result=new List<GeneratedPetSource>();
      if(Directory.Exists(path)){
        var pending=new Queue<KeyValuePair<string,int>>();pending.Enqueue(new KeyValuePair<string,int>(path,0));int visited=0;
        while(pending.Count>0){var current=pending.Dequeue();
          foreach(string file in Directory.GetFiles(current.Key)){
            if(++visited>4000)throw new Exception("資料夾檔案太多，請選單隻寵物的 outputs 資料夾。");
            if(!ImageFile(file)||!AtlasName(file))continue;
            if(new FileInfo(file).Length>MaxImage)continue;
            if(Path.GetExtension(file).Equals(".png",StringComparison.OrdinalIgnoreCase))using(var s=System.IO.File.OpenRead(file)){if(!PngShape(s))continue;}
            Add(result,new GeneratedPetSource{File=file,Label=file.Substring(path.TrimEnd(Path.DirectorySeparatorChar).Length+1)});
          }
          if(current.Value<4)foreach(string dir in Directory.GetDirectories(current.Key)){
            if(++visited>4000)throw new Exception("資料夾太大，請選更小的資料夾。");
            if((System.IO.File.GetAttributes(dir)&FileAttributes.ReparsePoint)==0)pending.Enqueue(new KeyValuePair<string,int>(dir,current.Value+1));
          }
        }
      }else if(System.IO.File.Exists(path)&&Path.GetExtension(path).Equals(".zip",StringComparison.OrdinalIgnoreCase)){
        if(new FileInfo(path).Length>256L*1024*1024)throw new Exception("紀錄 ZIP 最多 256 MB；較大的紀錄請先解壓後選 outputs 資料夾。");
        using(var zip=ZipFile.OpenRead(path)){
          if(zip.Entries.Count>2000)throw new Exception("ZIP 檔案太多，請改選解壓後的寵物資料夾。");
          var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
          foreach(var e in zip.Entries){string key=SafeEntry(e.FullName);if(!seen.Add(key))throw new Exception("ZIP 含重複檔名，無法確定版本。");}
          foreach(var e in zip.Entries){
            if(!ImageFile(e.FullName)||!AtlasName(e.FullName)||e.Length<1||e.Length>MaxImage||e.FullName.StartsWith("__MACOSX/"))continue;
            if(Path.GetExtension(e.FullName).Equals(".png",StringComparison.OrdinalIgnoreCase))using(var s=e.Open()){if(!PngShape(s))continue;}
            Add(result,new GeneratedPetSource{File=path,Entry=e.FullName,Label=e.FullName});
          }
        }
      }else if(System.IO.File.Exists(path)&&ImageFile(path))Add(result,new GeneratedPetSource{File=path,Label=Path.GetFileName(path)});
      else throw new Exception("請選 PET 的 outputs 資料夾、紀錄 ZIP 或完整 PNG／WebP 圖集。");
      result.Sort((a,b)=>String.Compare(a.Label,b.Label,StringComparison.OrdinalIgnoreCase));
      if(result.Count==0)throw new Exception("找不到 v2 圖集。請選含 spritesheet 圖片的資料夾；完整圖集須為 8×11 格、單格 12:13。");
      return result;
    }
    public static byte[] Read(GeneratedPetSource source){
      if(source.Entry==null){var info=new FileInfo(source.File);if(!info.Exists||info.Length<1||info.Length>MaxImage)throw new Exception("圖片不存在或超過 32 MB。");return System.IO.File.ReadAllBytes(source.File);}
      using(var zip=ZipFile.OpenRead(source.File)){
        var e=zip.GetEntry(source.Entry);if(e==null||e.Length<1||e.Length>MaxImage)throw new Exception("ZIP 圖片不存在或超過 32 MB。");
        using(var stream=e.Open())using(var output=new MemoryStream()){
          byte[] buffer=new byte[8192];int n;while((n=stream.Read(buffer,0,buffer.Length))>0){if(output.Length+n>MaxImage)throw new Exception("圖片解壓超過 32 MB。");output.Write(buffer,0,n);}return output.ToArray();
        }
      }
    }
    public static string Hash(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    public static GeneratedPetSelection Select(PetLibrary library,GeneratedPetSource source){
      byte[] bytes=Read(source);Bitmap image=null;string temp=Path.Combine(Path.GetTempPath(),"DailyPetSource-"+Guid.NewGuid().ToString("N")+Path.GetExtension(source.Filename));
      try{
        System.IO.File.WriteAllBytes(temp,bytes);image=library.ReadChatBitmap(temp);PetLibrary.Validate(image,true,true);
        return new GeneratedPetSelection{Source=source,Bytes=bytes,Atlas=image,Sha256=Hash(bytes)};
      }catch{if(image!=null)image.Dispose();throw;}
      finally{if(System.IO.File.Exists(temp))System.IO.File.Delete(temp);}
    }
    public static string GuessName(GeneratedPetSource source){
      string name=Regex.Replace(Path.GetFileNameWithoutExtension(source.Filename),"[-_ ]?(spritesheet|sprite|atlas).*$","",RegexOptions.IgnoreCase).Trim();
      if(name.Length==0)name=Path.GetFileName(Path.GetDirectoryName(source.Entry ?? source.File));
      return String.IsNullOrWhiteSpace(name)?"新寵物":name;
    }
    public static void Export(GeneratedPetSelection pet,string name,string output){
      PetLibrary.Validate(pet.Atlas,true,true);
      name=PetLibrary.NameFrom(new Dictionary<string,object>{{"displayName",name}},"新寵物");
      string target=Path.GetFullPath(output);if(System.IO.File.Exists(target))throw new Exception("目的檔案已存在，請選新檔名；原檔案已保留。");
      string temp=target+".partial-"+Guid.NewGuid().ToString("N");
      try{
        using(var file=new FileStream(temp,FileMode.CreateNew,FileAccess.Write))using(var zip=new ZipArchive(file,ZipArchiveMode.Create)){
          string sprite="spritesheet"+Path.GetExtension(pet.Source.Filename).ToLowerInvariant();
          var meta=zip.CreateEntry("pet/pet.json");using(var writer=new StreamWriter(meta.Open(),new UTF8Encoding(false)))writer.Write(Json.Encode(new {id="custom-pet",displayName=name,chatName=name,spriteVersionNumber=2,spritesheetPath=sprite,sourceSha256=pet.Sha256}));
          using(var stream=zip.CreateEntry("pet/"+sprite).Open())stream.Write(pet.Bytes,0,pet.Bytes.Length);
        }
        System.IO.File.Move(temp,target);
      }finally{if(System.IO.File.Exists(temp))System.IO.File.Delete(temp);}
    }
    public static PetAppearance Import(PetLibrary library,GeneratedPetSelection pet,string name){
      string temp=Path.Combine(Path.GetTempPath(),"DailyPetPack-"+Guid.NewGuid().ToString("N")+".zip");
      try{Export(pet,name,temp);return library.Import(temp);}finally{if(System.IO.File.Exists(temp))System.IO.File.Delete(temp);}
    }
  }

  sealed class PetQuickImport : Form {
    readonly PetLibrary library;
    readonly ListBox candidates=new ListBox();
    readonly TextBox name=new TextBox();
    readonly Label status=new Label(),detail=new Label();
    readonly ComboBox state=new ComboBox();
    readonly ArtworkCanvas canvas=new ArtworkCanvas();
    readonly Button install=new Button(),export=new Button(),pause=new Button();
    readonly System.Windows.Forms.Timer animation=new System.Windows.Forms.Timer();
    readonly bool applyImmediately;
    GeneratedPetSelection selected;
    int frame,epoch;bool working,playing=true,finished;
    public PetAppearance Saved;
    static readonly Color Surface=Color.FromArgb(27,33,46),TextColor=Color.FromArgb(232,237,246),Muted=Color.FromArgb(176,190,209),Accent=Color.FromArgb(124,174,255);
    public PetQuickImport(PetLibrary petLibrary,bool apply){
      library=petLibrary;applyImmediately=apply;Text="PET → Daily Agent · 快速匯入";BackColor=Color.FromArgb(18,23,33);ForeColor=TextColor;
      Font=new Font("Microsoft JhengHei UI",10);AutoScaleMode=AutoScaleMode.Dpi;ClientSize=new Size(900,700);MinimumSize=new Size(820,680);StartPosition=FormStartPosition.CenterScreen;AllowDrop=true;
      var layout=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(24),ColumnCount=2,RowCount=7};layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,55));layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,45));
      foreach(int h in new[]{62,52,0,52,84,52,72})layout.RowStyles.Add(h==0?new RowStyle(SizeType.Percent,100):new RowStyle(SizeType.Absolute,h));Controls.Add(layout);
      var heading=new Label{Text="把 PET 素材變成桌寵\n選來源 → 確認版本與動畫 → 匯入或匯出",Dock=DockStyle.Fill,AutoSize=false,ForeColor=TextColor,Font=new Font("Microsoft JhengHei UI",12,FontStyle.Bold)};layout.Controls.Add(heading,0,0);layout.SetColumnSpan(heading,2);
      var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};layout.Controls.Add(actions,0,1);layout.SetColumnSpan(actions,2);
      var pickFile=Button("選 ZIP／圖集",false);var pickFolder=Button("選 outputs 資料夾",false);actions.Controls.Add(pickFile);actions.Controls.Add(pickFolder);
      pickFile.Click+=async delegate{if(working)return;using(var dialog=new OpenFileDialog{Filter="PET 素材|*.zip;*.png;*.webp",Title="選擇 PET 產出的素材"})if(dialog.ShowDialog(this)==DialogResult.OK)await LoadSource(dialog.FileName);};
      pickFolder.Click+=async delegate{if(working)return;using(var dialog=new FolderBrowserDialog{Description="選擇 PET 產出的 outputs 資料夾"})if(dialog.ShowDialog(this)==DialogResult.OK)await LoadSource(dialog.SelectedPath);};
      candidates.Dock=DockStyle.Fill;candidates.BackColor=Surface;candidates.ForeColor=TextColor;candidates.BorderStyle=BorderStyle.None;candidates.HorizontalScrollbar=true;candidates.IntegralHeight=false;candidates.AccessibleName="圖集版本，請選擇修正版";layout.Controls.Add(candidates,0,2);
      canvas.Dock=DockStyle.Fill;canvas.BackColor=Surface;canvas.Margin=new Padding(12,3,3,3);canvas.AccessibleName="動畫預覽";canvas.Draw=PaintPreview;layout.Controls.Add(canvas,1,2);
      var field=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1};field.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,80));field.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
      field.Controls.Add(new Label{Text="寵物名稱",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);name.Dock=DockStyle.Fill;name.Margin=new Padding(3,12,8,3);name.BackColor=Surface;name.ForeColor=TextColor;name.MaxLength=64;name.AccessibleName="寵物名稱";field.Controls.Add(name,1,0);layout.Controls.Add(field,0,3);
      var playback=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(12,8,0,0)};layout.Controls.Add(playback,1,3);
      state.DropDownStyle=ComboBoxStyle.DropDownList;state.BackColor=Surface;state.ForeColor=TextColor;state.FlatStyle=FlatStyle.Flat;state.Width=170;state.AccessibleName="預覽動作";state.Items.AddRange(new object[]{"待機","往右跑","往左跑","揮手","跳躍","失敗","等待","工作","檢查","上半部視線","下半部視線"});state.SelectedIndex=2;playback.Controls.Add(state);pause.Text="暫停";pause.BackColor=Surface;pause.Width=70;pause.Height=32;pause.FlatStyle=FlatStyle.Flat;pause.ForeColor=TextColor;playback.Controls.Add(pause);
      state.DrawMode=DrawMode.OwnerDrawFixed;state.ItemHeight=22;state.DrawItem+=delegate(object sender,DrawItemEventArgs e){
        using(var background=new SolidBrush((e.State&DrawItemState.Selected)!=0?Color.FromArgb(54,76,108):Surface))e.Graphics.FillRectangle(background,e.Bounds);
        int index=e.Index<0?state.SelectedIndex:e.Index;if(index>=0)TextRenderer.DrawText(e.Graphics,Convert.ToString(state.Items[index]),Font,e.Bounds,TextColor,TextFormatFlags.Left|TextFormatFlags.VerticalCenter);e.DrawFocusRectangle();
      };
      detail.Dock=DockStyle.Fill;detail.ForeColor=Muted;detail.Padding=new Padding(0,8,8,0);detail.Text="多份版本會全部列出，請自行確認左跑修正版。\n保留原圖；不呼叫 AI、不下載模型。";layout.Controls.Add(detail,0,4);layout.SetColumnSpan(detail,2);
      var bottom=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};layout.Controls.Add(bottom,0,5);layout.SetColumnSpan(bottom,2);
      StyleButton(install,apply?"匯入並使用":"匯入我的 Daily Agent",true);StyleButton(export,"匯出安裝 ZIP",false);bottom.Controls.Add(install);bottom.Controls.Add(export);
      status.Dock=DockStyle.Fill;status.Padding=new Padding(0,8,0,0);status.ForeColor=Muted;status.Text="也可以直接把資料夾、ZIP 或圖集拖進這個視窗。";layout.Controls.Add(status,0,6);layout.SetColumnSpan(status,2);
      candidates.SelectedIndexChanged+=async delegate{await SelectCandidate();};state.SelectedIndexChanged+=delegate{frame=0;animation.Interval=PetAnimations.Interval(state.SelectedIndex);canvas.Invalidate();};
      pause.Click+=delegate{playing=!playing;pause.Text=playing?"暫停":"播放";UpdateButtons();};
      animation.Interval=100;animation.Tick+=delegate{if(selected!=null){frame=(frame+1)%PetAnimations.Counts[state.SelectedIndex];canvas.Invalidate();}};
      VisibleChanged+=delegate{UpdateButtons();};FormClosing+=delegate(object sender,FormClosingEventArgs e){if(working){e.Cancel=true;status.Text="請等目前的驗證或匯入完成，再關閉視窗。";}};FormClosed+=delegate{epoch++;animation.Dispose();if(selected!=null)selected.Dispose();};
      install.Click+=async delegate{await Install();};export.Click+=async delegate{await Export();};
      DragEnter+=delegate(object sender,DragEventArgs e){if(!working&&e.Data.GetDataPresent(DataFormats.FileDrop))e.Effect=DragDropEffects.Copy;};
      DragDrop+=async delegate(object sender,DragEventArgs e){var files=e.Data.GetData(DataFormats.FileDrop) as string[];if(!working&&files!=null&&files.Length==1)await LoadSource(files[0]);else status.Text="請一次拖入一個資料夾或檔案。";};UpdateButtons();
    }
    static Button Button(string text,bool primary){var b=new Button();StyleButton(b,text,primary);return b;}
    static void StyleButton(Button b,string text,bool primary){b.Text=text;b.AutoSize=false;b.Width=190;b.Height=42;b.Margin=new Padding(0,0,10,0);b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderColor=Color.FromArgb(76,91,114);b.BackColor=primary?Accent:Surface;b.ForeColor=primary?Color.FromArgb(18,23,33):TextColor;}
    void UpdateButtons(){install.Enabled=selected!=null&&!working&&!finished;export.Enabled=selected!=null&&!working;candidates.Enabled=!working;name.Enabled=!working;pause.Enabled=selected!=null;animation.Enabled=selected!=null&&playing&&Visible&&!working;}
    public async Task LoadSource(string path){
      if(working)return;working=true;finished=false;epoch++;if(selected!=null){selected.Dispose();selected=null;}candidates.Items.Clear();UpdateButtons();canvas.Invalidate();status.Text="正在尋找圖集…";
      try{var list=await Task.Run(()=>GeneratedPetPack.Scan(path));if(IsDisposed)return;candidates.Items.AddRange(list.ToArray());status.Text=list.Count==1?"找到一份圖集，正在驗證。":"找到 "+list.Count+" 份圖集。請選版本並查看左跑動畫；工具不會猜哪一份已修好。";}
      catch(Exception e){if(!IsDisposed)status.Text=e.Message;}
      finally{if(!IsDisposed){working=false;UpdateButtons();if(candidates.Items.Count==1)candidates.SelectedIndex=0;}}
    }
    async Task SelectCandidate(){
      if(working||candidates.SelectedItem==null)return;int ticket=++epoch;var source=(GeneratedPetSource)candidates.SelectedItem;
      working=true;finished=false;if(selected!=null){selected.Dispose();selected=null;}UpdateButtons();canvas.Invalidate();status.Text="正在驗證格數、動作與透明背景…";
      try{
        var next=await Task.Run(()=>GeneratedPetPack.Select(library,source));if(IsDisposed||ticket!=epoch){next.Dispose();return;}selected=next;name.Text=GeneratedPetPack.GuessName(source);frame=0;
        detail.Text=source.Label+"\n"+next.Atlas.Width+" × "+next.Atlas.Height+" · 8×11 格 · v2 格位與透明背景檢查通過\nSHA-256："+next.Sha256;status.Text="請確認往左跑的動畫與名稱，再匯入。格式檢查不代表動作美術已通過審核。";
      }catch(Exception e){if(!IsDisposed)status.Text=e.Message+" 可改選另一份圖集，或用外觀編輯器處理。";}
      finally{if(!IsDisposed){working=false;UpdateButtons();canvas.Invalidate();}}
    }
    async Task Install(){
      if(selected==null||working)return;working=true;UpdateButtons();status.Text="正在加入你的寵物素材庫…";string petName=name.Text;
      try{
        var pet=await Task.Run(()=>GeneratedPetPack.Import(library,selected,petName));
        if(IsDisposed){pet.Dispose();return;}
        if(applyImmediately){Saved=pet;DialogResult=DialogResult.OK;Close();}
        else {pet.Dispose();finished=true;status.Text="已匯入。桌寵右鍵 → 設定 → 更換寵物形象，選擇「"+petName+"」。原本寵物與記憶已保留。";}
      }catch(Exception e){if(!IsDisposed)status.Text=e.Message;}
      finally{if(!IsDisposed){working=false;UpdateButtons();}}
    }
    async Task Export(){
      if(selected==null||working)return;using(var dialog=new SaveFileDialog{Filter="寵物安裝包|*.zip",FileName=Regex.Replace(name.Text,"[\\\\/:*?\"<>|]","_")+"-DailyAgent-v2.zip",OverwritePrompt=true}){
        if(dialog.ShowDialog(this)!=DialogResult.OK)return;working=true;UpdateButtons();string petName=name.Text;
        try{await Task.Run(()=>GeneratedPetPack.Export(selected,petName,dialog.FileName));if(!IsDisposed)status.Text="安裝包已匯出，可在其他 Daily Agent 匯入；不含聊天、帳號或記憶。";}
        catch(Exception e){if(!IsDisposed)status.Text=e.Message;}finally{if(!IsDisposed){working=false;UpdateButtons();}}
      }
    }
    void PaintPreview(PaintEventArgs e){
      int tile=20;using(var brush=new SolidBrush(Color.FromArgb(37,45,60)))for(int y=0;y<canvas.Height;y+=tile)for(int x=0;x<canvas.Width;x+=tile)if((x/tile+y/tile)%2==0)e.Graphics.FillRectangle(brush,x,y,tile,tile);
      if(selected==null){using(var brush=new SolidBrush(Muted))e.Graphics.DrawString("選擇圖集後預覽\n預設播放往左跑",Font,brush,new RectangleF(24,24,canvas.Width-48,80));return;}
      int row=state.SelectedIndex,cw=selected.Atlas.Width/8,ch=selected.Atlas.Height/11;float scale=Math.Min((canvas.Width-32f)/cw,(canvas.Height-32f)/ch);int w=(int)(cw*scale),h=(int)(ch*scale);
      e.Graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;e.Graphics.PixelOffsetMode=PixelOffsetMode.HighQuality;
      e.Graphics.DrawImage(selected.Atlas,new Rectangle((canvas.Width-w)/2,(canvas.Height-h)/2,w,h),new Rectangle(frame*cw,row*ch,cw,ch),GraphicsUnit.Pixel);
    }
    public async Task SelfTest(string project,string output,string atlasFile){
      Directory.CreateDirectory(output);var checks=new List<string>();string original=GeneratedPetPack.Hash(System.IO.File.ReadAllBytes(atlasFile));
      string fixture=Path.Combine(output,"fixture-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(fixture);
      try{
        var direct=GeneratedPetPack.Scan(atlasFile);
        if(direct.Count!=1)throw new Exception("Single atlas discovery failed");
        using(var pet=GeneratedPetPack.Select(library,direct[0])){
          if(pet.Sha256!=original||pet.Atlas.Width!=1536||pet.Atlas.Height!=2288)throw new Exception("Source bytes or dimensions changed");
          checks.Add("real-repaired-atlas-native-structure-validation");
          string zipPath=Path.Combine(fixture,"Lyra-DailyAgent.zip");GeneratedPetPack.Export(pet,"萊拉 · 左跑修正版",zipPath);
          var packed=GeneratedPetPack.Scan(zipPath);using(var restored=GeneratedPetPack.Select(library,packed[0]))if(restored.Sha256!=original)throw new Exception("Repack changed atlas bytes");
          using(var zip=ZipFile.OpenRead(zipPath)){if(zip.Entries.Count!=2)throw new Exception("Pack leaked unrelated data");}
          checks.Add("export-and-reimport-preserve-exact-source-hash-two-files-only");
          int before=library.List().Count;using(var imported=library.Import(zipPath)){
            if(!imported.Animated||imported.Name!="萊拉 · 左跑修正版")throw new Exception("Native importer name mismatch");
            using(var reload=library.Load(imported.Id))if(!reload.Animated)throw new Exception("Native library reload failed");
          }
          if(library.List().Count!=before+1)throw new Exception("Native library count mismatch");
          checks.Add("native-import-unicode-name-and-persistent-reload");
          bool rejected=false;try{GeneratedPetPack.Export(pet,"test",atlasFile);}catch{rejected=true;}
          if(!rejected||GeneratedPetPack.Hash(System.IO.File.ReadAllBytes(atlasFile))!=original)throw new Exception("Existing source overwritten");
          checks.Add("refuse-overwrite-and-preserve-source");
          string opaque=Path.Combine(fixture,"opaque.png");using(var bad=new Bitmap(pet.Atlas.Width,pet.Atlas.Height))using(var g=Graphics.FromImage(bad)){g.Clear(Color.White);bad.Save(opaque,ImageFormat.Png);}
          rejected=false;try{using(var bad=GeneratedPetPack.Select(library,GeneratedPetPack.Scan(opaque)[0])){}}catch{rejected=true;}
          if(!rejected||library.List().Count!=before+1)throw new Exception("Opaque atlas accepted or library mutated");
          checks.Add("opaque-atlas-rejected-without-library-change");
        }
        string unsafeZip=Path.Combine(fixture,"unsafe.zip");using(var zip=ZipFile.Open(unsafeZip,ZipArchiveMode.Create)){using(var s=zip.CreateEntry("../escaped.txt").Open())s.WriteByte(1);}
        bool unsafeRejected=false;try{GeneratedPetPack.Scan(unsafeZip);}catch{unsafeRejected=true;}if(!unsafeRejected)throw new Exception("Unsafe ZIP accepted");
        checks.Add("zip-path-traversal-rejected-before-reading");
        string duplicate=Path.Combine(fixture,"duplicate.zip");using(var zip=ZipFile.Open(duplicate,ZipArchiveMode.Create)){zip.CreateEntry("sprite.png");zip.CreateEntry("sprite.png");}
        bool duplicateRejected=false;try{GeneratedPetPack.Scan(duplicate);}catch{duplicateRejected=true;}if(!duplicateRejected)throw new Exception("Ambiguous ZIP accepted");checks.Add("duplicate-archive-entry-rejected");
        string wrongShape=Path.Combine(fixture,"wrong.png");using(var image=new Bitmap(256,256))image.Save(wrongShape,ImageFormat.Png);
        bool shapeRejected=false;try{using(var bad=GeneratedPetPack.Select(library,GeneratedPetPack.Scan(wrongShape)[0])){}}catch{shapeRejected=true;}if(!shapeRejected)throw new Exception("Wrong atlas shape accepted");checks.Add("wrong-grid-rejected");
        await LoadSource(Path.GetDirectoryName(atlasFile));if(working)throw new Exception("Folder scan still working");
        if(candidates.Items.Count<2||candidates.SelectedIndex!=-1||selected!=null||install.Enabled)throw new Exception("Ambiguous version silently selected");checks.Add("multiple-versions-require-explicit-choice");
        for(int i=0;i<candidates.Items.Count;i++)if(((GeneratedPetSource)candidates.Items[i]).File==Path.GetFullPath(atlasFile)){candidates.SelectedIndex=i;break;}
        for(int i=0;i<1000&&working;i++)await Task.Delay(30);
        if(selected==null||selected.Sha256!=original||state.SelectedIndex!=2||state.Text!="往左跑"||!install.Enabled)throw new Exception("UI did not validate corrected atlas");
        pause.PerformClick();if(playing||animation.Enabled)throw new Exception("Pause failed");checks.Add("gui-select-corrected-atlas-left-run-preview-and-pause");
        name.Text="Lyra GUI 測試";using(var screenshot=new Bitmap(Width,Height)){DrawToBitmap(screenshot,new Rectangle(0,0,Width,Height));screenshot.Save(Path.Combine(output,"pet-quick-import.png"),ImageFormat.Png);}
        int count=library.List().Count;install.PerformClick();for(int i=0;i<1000&&working;i++)await Task.Delay(30);
        if(working||library.List().Count!=count+1||!finished||!export.Enabled)throw new Exception("UI install did not finish");checks.Add("gui-install-click-and-export-remains-available");
        string record=Path.Combine(Path.GetDirectoryName(atlasFile),"lyra-left-repair-record.zip");
        if(System.IO.File.Exists(record)){
          var versions=GeneratedPetPack.Scan(record);bool found=false;
          foreach(var v in versions)if(v.Entry.EndsWith("spritesheet-extended.png",StringComparison.OrdinalIgnoreCase)){using(var candidate=GeneratedPetPack.Select(library,v)){if(candidate.Sha256==original)found=true;}if(found)break;}
          if(!found)throw new Exception("Repair record failed to expose corrected atlas");checks.Add("real-repair-record-zip-finds-identical-fixed-atlas");
        }
        using(var lumi=library.Load("lumi")){if(lumi.Id!="lumi")throw new Exception("Original pet unavailable");}checks.Add("built-in-lumi-preserved");
        string webp=Path.Combine(project,"daily-agent","desktop","assets","lumi","spritesheet.webp");
        using(var webpPet=GeneratedPetPack.Select(library,GeneratedPetPack.Scan(webp)[0])){
          string webpZip=Path.Combine(fixture,"webp.zip");GeneratedPetPack.Export(webpPet,"WebP 相容測試",webpZip);
          using(var native=library.Import(webpZip))if(!native.Animated)throw new Exception("WebP native import failed");
          using(var zip=ZipFile.OpenRead(webpZip))using(var s=zip.GetEntry("pet/spritesheet.webp").Open())using(var bytes=new MemoryStream()){s.CopyTo(bytes);if(GeneratedPetPack.Hash(bytes.ToArray())!=GeneratedPetPack.Hash(System.IO.File.ReadAllBytes(webp)))throw new Exception("WebP source modified");}
        }checks.Add("real-webp-decoder-package-and-native-import-preserve-bytes");
        if(GeneratedPetPack.Hash(System.IO.File.ReadAllBytes(atlasFile))!=original)throw new Exception("User source changed");
        System.IO.File.WriteAllText(Path.Combine(output,"pet-quick-import-test.json"),Json.Encode(new{passed=true,checks=checks,sourceSha256=original}),new UTF8Encoding(false));
      }catch(Exception e){System.IO.File.WriteAllText(Path.Combine(output,"pet-quick-import-test.json"),Json.Encode(new{passed=false,checks=checks,error=e.ToString()}),new UTF8Encoding(false));}
      finally{working=false;Close();}
    }
  }
}
