using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace DailyPet {
  sealed class SheetRow : IDisposable {
    public readonly List<Bitmap> Frames=new List<Bitmap>();
    public string Action="unknown";
    public bool SuspectOrder;
    public void Dispose(){foreach(var frame in Frames)frame.Dispose();Frames.Clear();}
  }
  sealed class SheetAnalysis : IDisposable {
    public readonly List<SheetRow> Rows=new List<SheetRow>();
    public int Columns;
    public bool StandardLayout;
    public string Warning="";
    public void Dispose(){foreach(var row in Rows)row.Dispose();Rows.Clear();}
  }
  static class SpriteSheetAnalyzer {
    public static readonly string[] ActionLabels={"待機","向右跑","向左跑","揮手","跳躍","失敗／沮喪","等待","忙碌","閱讀／檢查","轉頭（前 8 方向）","轉頭（後 8 方向）"};
    public static Rectangle VisibleBounds(Bitmap image){
      int left=image.Width,top=image.Height,right=-1,bottom=-1;
      var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
      try{byte[] bytes=new byte[image.Width*4];for(int y=0;y<image.Height;y++){Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),bytes,0,bytes.Length);for(int x=0;x<image.Width;x++)if(bytes[x*4+3]>16){left=Math.Min(left,x);right=Math.Max(right,x);top=Math.Min(top,y);bottom=Math.Max(bottom,y);}}}finally{image.UnlockBits(data);}
      return right<left?Rectangle.Empty:Rectangle.FromLTRB(left,top,right+1,bottom+1);
    }
    static int[] Projection(Bitmap image,bool horizontal){
      int[] result=new int[horizontal?image.Height:image.Width];var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
      try{byte[] bytes=new byte[image.Width*4];for(int y=0;y<image.Height;y++){Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),bytes,0,bytes.Length);for(int x=0;x<image.Width;x++)if(bytes[x*4+3]>32)result[horizontal?y:x]++;}}finally{image.UnlockBits(data);}return result;
    }
    static int[] Cuts(int[] projection,int explicitCount,int perpendicular){
      int length=projection.Length;
      if(explicitCount>0){var cuts=new int[explicitCount+1];for(int i=0;i<=explicitCount;i++)cuts[i]=i*length/explicitCount;return cuts;}
      var bands=new List<int[]>();int start=-1,threshold=Math.Max(1,perpendicular/300);
      for(int i=0;i<=length;i++){bool occupied=i<length&&projection[i]>threshold;if(occupied&&start<0)start=i;if(!occupied&&start>=0){bands.Add(new[]{start,i});start=-1;}}
      var merged=new List<int[]>();foreach(var band in bands){if(merged.Count>0&&band[0]-merged[merged.Count-1][1]<Math.Max(3,length/90))merged[merged.Count-1][1]=band[1];else merged.Add(band);}
      merged.RemoveAll(b=>b[1]-b[0]<Math.Max(6,length/150));
      if(merged.Count<1||merged.Count>16)throw new Exception("無法可靠分出影格，請填寫實際欄數與列數後重新分析。");
      var result=new int[merged.Count+1];result[0]=0;result[result.Length-1]=length;for(int i=1;i<merged.Count;i++)result[i]=(merged[i-1][1]+merged[i][0])/2;return result;
    }
    public static SheetAnalysis Analyze(Bitmap input,int columns,int rows,int tolerance){
      if(input.Width<32||input.Height<32)throw new Exception("動畫圖太小，請使用較清楚的原圖。");
      var result=new SheetAnalysis();
      try{using(var cleaned=new PetArtwork(input,false)){
        cleaned.RemoveEdgeBackground(0,0,tolerance);
        // Prefer the published v2 layout only when the whole-sheet ratio matches.
        bool standard=columns==0&&rows==0&&Math.Abs((double)input.Width/input.Height-1536.0/2288)<.006;
        int[] xs=Cuts(Projection(cleaned.Source,false),standard?8:columns,input.Height),ys=Cuts(Projection(cleaned.Source,true),standard?11:rows,input.Width);
        result.Columns=xs.Length-1;result.StandardLayout=(xs.Length==9&&ys.Length==12);
        if(ys.Length>17)throw new Exception("一次最多處理 16 列動作。");
        for(int row=0;row<ys.Length-1;row++){
          var sequence=new SheetRow();result.Rows.Add(sequence);
          if(result.StandardLayout)sequence.Action=PetAnimations.Names[row];
          for(int col=0;col<xs.Length-1;col++){
            if(result.StandardLayout&&col>=PetAnimations.Counts[row])continue;
            Rectangle cell=Rectangle.FromLTRB(xs[col],ys[row],xs[col+1],ys[row+1]);
            var frame=cleaned.Source.Clone(cell,PixelFormat.Format32bppPArgb);
            if(VisibleBounds(frame).IsEmpty){frame.Dispose();continue;}sequence.Frames.Add(frame);
          }
          sequence.SuspectOrder=JumpScore(sequence.Frames)>.34;
        }
        if(result.Columns<2)result.Warning="只找到一欄；若原圖有多個影格，請填入欄數與列數重新分析。";
        else result.Warning="自動切格與去背完成。動作名稱及影格連貫性請看下方播放預覽；原圖不會被改寫。";
      }return result;}catch{result.Dispose();throw;}
    }
    static float[] Signature(Bitmap image){
      var result=new float[24*26];using(var thumb=new Bitmap(24,26,PixelFormat.Format32bppPArgb)){
        using(var g=Graphics.FromImage(thumb)){g.Clear(Color.Transparent);g.DrawImage(image,0,0,24,26);}
        for(int y=0;y<26;y++)for(int x=0;x<24;x++){Color c=thumb.GetPixel(x,y);result[y*24+x]=c.A/255f;}
      }return result;
    }
    static double Distance(float[] a,float[] b){double diff=0,total=0;for(int i=0;i<a.Length;i++){diff+=Math.Abs(a[i]-b[i]);total+=Math.Max(a[i],b[i]);}return total==0?0:diff/total;}
    static double JumpScore(List<Bitmap> frames){double max=0;for(int i=1;i<frames.Count;i++)max=Math.Max(max,Distance(Signature(frames[i-1]),Signature(frames[i])));return max;}
    public static List<int> SuggestOrder(List<Bitmap> frames){
      var order=new List<int>();if(frames.Count==0)return order;order.Add(0);var sig=new List<float[]>();foreach(var f in frames)sig.Add(Signature(f));
      while(order.Count<frames.Count){int best=-1;double score=Double.MaxValue;for(int i=1;i<frames.Count;i++)if(!order.Contains(i)){double d=Distance(sig[order[order.Count-1]],sig[i]);if(d<score){score=d;best=i;}}order.Add(best);}
      double old=0,next=0;for(int i=1;i<frames.Count;i++){old+=Distance(sig[i-1],sig[i]);next+=Distance(sig[order[i-1]],sig[order[i]]);}if(next>=old*.85){order.Clear();for(int i=0;i<frames.Count;i++)order.Add(i);}return order;
    }
    public static Bitmap Build(SheetAnalysis analysis,bool align,bool reorder,bool fallback,out string report){
      var mapped=new Dictionary<string,SheetRow>();foreach(var row in analysis.Rows)if(row.Action!="unknown"&&row.Frames.Count>0){if(mapped.ContainsKey(row.Action))throw new Exception("動作「"+row.Action+"」重複，請確認每列的動作名稱。");mapped[row.Action]=row;}
      SheetRow idle;if(!mapped.TryGetValue("idle",out idle))throw new Exception("請指定一列為待機 idle，才能組成寵物動畫。");
      var notes=new List<string>();var atlas=new Bitmap(1536,2288,PixelFormat.Format32bppPArgb);
      try{using(var g=Graphics.FromImage(atlas)){g.Clear(Color.Transparent);g.InterpolationMode=InterpolationMode.HighQualityBicubic;
        for(int row=0;row<11;row++){
          string action=PetAnimations.Names[row];SheetRow sequence;
          if(!mapped.TryGetValue(action,out sequence)){if(!fallback)throw new Exception("缺少「"+action+"」動作，請補圖或勾選暫用待機。");sequence=idle;notes.Add(action+"：缺圖，暫用待機（未補畫）");}
          int count=PetAnimations.Counts[row];var frames=sequence.Frames;var order=new List<int>();for(int i=0;i<frames.Count;i++)order.Add(i);
          if(reorder&&action!="jumping"&&row<9){order=SuggestOrder(frames);bool changed=false;for(int i=0;i<order.Count;i++)if(order[i]!=i)changed=true;if(changed)notes.Add(action+"：已依相鄰輪廓相似度調整順序，請預覽確認");}
          var bounds=new List<Rectangle>();int maxW=1,maxH=1;foreach(var frame in frames){var b=VisibleBounds(frame);bounds.Add(b);maxW=Math.Max(maxW,b.Width);maxH=Math.Max(maxH,b.Height);}
          float commonScale=Math.Min(166f/maxW,185f/maxH);
          // A shared scale preserves movement proportions; jumping retains its vertical trajectory.
          for(int col=0;col<count;col++){
            int i=order[Math.Min(order.Count-1,(int)Math.Round(col*(order.Count-1.0)/Math.Max(1,count-1)))];var frame=frames[i];var b=bounds[i];
            float x,y,w,h;if(align){w=frame.Width*commonScale;h=frame.Height*commonScale;x=96-(b.Left+b.Width*.5f)*commonScale;y=action=="jumping"?196-frame.Height*commonScale:196-b.Bottom*commonScale;}
            else{float s=Math.Min(192f/frame.Width,208f/frame.Height);w=frame.Width*s;h=frame.Height*s;x=(192-w)/2;y=(208-h)/2;}
            var clip=new Rectangle(col*192,row*208,192,208);g.SetClip(clip);g.DrawImage(frame,new RectangleF(clip.X+x,clip.Y+y,w,h));g.ResetClip();
          }
          if(frames.Count!=count)notes.Add(action+"："+frames.Count+" 格轉為 "+count+" 格（僅取樣／重複現有影格）");
          if(sequence.SuspectOrder)notes.Add(action+"：姿勢變化較大，請確認連貫性；不會自動重畫肢體");
        }
      }PetLibrary.Validate(atlas,true,true);report=notes.Count==0?"全部動作已組裝，去背與對齊完成。":String.Join("\n",notes);return atlas;}catch{atlas.Dispose();throw;}
    }
    public static Bitmap ContactSheet(SheetAnalysis analysis){
      var image=new Bitmap(720,analysis.Rows.Count*110,PixelFormat.Format32bppPArgb);using(var g=Graphics.FromImage(image))using(var font=new Font("Arial",14)){
        g.Clear(Color.FromArgb(225,225,225));for(int r=0;r<analysis.Rows.Count;r++){g.DrawString("row "+r,font,Brushes.Black,4,r*110+35);var frames=analysis.Rows[r].Frames;for(int i=0;i<Math.Min(6,frames.Count);i++){int index=(int)Math.Round(i*(frames.Count-1.0)/Math.Max(1,Math.Min(6,frames.Count)-1));var frame=frames[index];float fit=Math.Min(94f/frame.Width,100f/frame.Height);g.DrawImage(frame,80+i*105+(94-frame.Width*fit)/2,r*110+5,frame.Width*fit,frame.Height*fit);}}
      }return image;
    }
  }

  sealed class SpriteSheetImportDialog : Form {
    readonly Bitmap original;
    readonly Api api;
    SheetAnalysis analysis;
    readonly NumericUpDown columns=new NumericUpDown(),rows=new NumericUpDown();
    readonly DataGridView mapping=new DataGridView();
    readonly Label info=new Label();
    readonly PictureBox preview=new PictureBox();
    readonly CheckBox align=new CheckBox(),reorder=new CheckBox(),fallback=new CheckBox();
    readonly Button analyze=new Button(),build=new Button();
    readonly Timer timer=new Timer();
    bool busy;
    int phase;
    public Bitmap Result;
    public string Report;
    public SpriteSheetImportDialog(Bitmap source,Api localApi){
      original=new Bitmap(source);api=localApi;Text="整張動畫圖 → 自動整理成桌寵";ClientSize=new Size(1000,740);MinimumSize=MaximumSize=Size;StartPosition=FormStartPosition.CenterParent;Font=new Font("Microsoft JhengHei UI",10);
      var intro=new Label{Text="丟入 GPT 生成的動畫圖：自動分格 → 去背 → 辨識動作 → 對齊 → 播放檢查。圖中每列應為同一個動作。",AutoSize=false};intro.SetBounds(20,15,960,45);Controls.Add(intro);
      var gridLabel=new Label{Text="欄／列：0 表示自動偵測；若切錯再改數字"};gridLabel.SetBounds(20,62,420,28);Controls.Add(gridLabel);
      columns.Maximum=rows.Maximum=16;columns.SetBounds(430,60,70,30);rows.SetBounds(515,60,70,30);Controls.Add(columns);Controls.Add(rows);
      analyze.Text="重新分析";analyze.SetBounds(610,58,150,34);Controls.Add(analyze);analyze.Click+=async delegate{await Analyze();};
      info.SetBounds(20,105,960,76);Controls.Add(info);
      mapping.SetBounds(20,190,560,420);mapping.AllowUserToAddRows=mapping.AllowUserToDeleteRows=false;mapping.RowHeadersVisible=false;mapping.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;
      mapping.Columns.Add(new DataGridViewTextBoxColumn{Name="source",HeaderText="原圖列",ReadOnly=true});mapping.Columns.Add(new DataGridViewTextBoxColumn{Name="frames",HeaderText="影格／檢查",ReadOnly=true});
      var choices=new List<KeyValuePair<string,string>>{new KeyValuePair<string,string>("unknown","未辨識，請選擇")};for(int i=0;i<PetAnimations.Names.Length;i++)choices.Add(new KeyValuePair<string,string>(PetAnimations.Names[i],SpriteSheetAnalyzer.ActionLabels[i]));
      var actions=new DataGridViewComboBoxColumn{Name="action",HeaderText="動作",DataSource=choices,ValueMember="Key",DisplayMember="Value"};mapping.Columns.Add(actions);mapping.Columns[0].FillWeight=18;mapping.Columns[1].FillWeight=30;mapping.Columns[2].FillWeight=52;Controls.Add(mapping);
      preview.SetBounds(600,190,375,420);preview.BackColor=Color.FromArgb(230,230,234);preview.SizeMode=PictureBoxSizeMode.Zoom;Controls.Add(preview);
      align.Text="自動對齊位置、統一比例（保留跳躍高度）";align.Checked=true;align.SetBounds(20,620,530,28);Controls.Add(align);
      reorder.Text="建議重新排列不連貫影格（跳躍、轉頭維持原順序）";reorder.SetBounds(20,652,560,28);Controls.Add(reorder);
      fallback.Text="缺少的動作暫用待機影格（不會補畫）";fallback.Checked=true;fallback.SetBounds(20,685,530,28);Controls.Add(fallback);
      build.Text="組裝成動畫，進入預覽";build.SetBounds(620,655,350,52);build.Enabled=false;Controls.Add(build);build.Click+=delegate{try{ApplyMapping();Result=SpriteSheetAnalyzer.Build(analysis,align.Checked,reorder.Checked,fallback.Checked,out Report);DialogResult=DialogResult.OK;Close();}catch(Exception e){info.Text=e.Message;}};
      timer.Interval=150;timer.Tick+=delegate{ShowPreview();};timer.Start();mapping.SelectionChanged+=delegate{phase=0;ShowPreview();};
      Shown+=async delegate{await Analyze();};FormClosing+=delegate(object sender,FormClosingEventArgs e){if(busy)e.Cancel=true;};
    }
    void ApplyMapping(){mapping.EndEdit();for(int i=0;i<analysis.Rows.Count;i++)analysis.Rows[i].Action=Convert.ToString(mapping.Rows[i].Cells[2].Value);}
    void ShowPreview(){if(analysis==null||mapping.CurrentCell==null)return;int index=mapping.CurrentCell.RowIndex;if(index<0||index>=analysis.Rows.Count)return;var frames=analysis.Rows[index].Frames;if(frames.Count==0)return;var previous=preview.Image;preview.Image=new Bitmap(frames[(phase++)%frames.Count]);if(previous!=null)previous.Dispose();}
    async Task Analyze(){
      if(busy)return;busy=true;analyze.Enabled=build.Enabled=mapping.Enabled=columns.Enabled=rows.Enabled=false;timer.Stop();info.Text="正在偵測影格、清理背景與檢查姿勢變化…";
      try{
        int c=(int)columns.Value,r=(int)rows.Value;var result=await Task.Run(()=>SpriteSheetAnalyzer.Analyze(original,c,r,18));if(analysis!=null)analysis.Dispose();analysis=result;
        string note="";
        if(!analysis.StandardLayout&&api!=null){
          info.Text="去背及分格完成，正在用本地模型辨識每列的動作；不會保存到記憶宮殿。";
          try{using(var contact=SpriteSheetAnalyzer.ContactSheet(analysis))using(var bytes=new MemoryStream()){
            contact.Save(bytes,ImageFormat.Png);var data=await api.Call("modules/appearance/classify",new{image=Convert.ToBase64String(bytes.ToArray()),rowCount=analysis.Rows.Count});
            var labels=data["rows"] as System.Collections.IEnumerable;if(labels!=null)foreach(var entry in labels){var item=entry as Dictionary<string,object>;if(item!=null){int index=Convert.ToInt32(item["row"]);if(index>=0&&index<analysis.Rows.Count)analysis.Rows[index].Action=Json.Text(item,"action");}}
          }}catch(Exception e){note="\n動作辨識未完成："+e.Message+"。可直接在表格選擇各列的動作。";}
        }
        else if(!analysis.StandardLayout)note="\n目前未連接本地模型，請在表格指定每列的動作；8×11 標準圖可直接套用標準排列。";
        mapping.Rows.Clear();for(int i=0;i<analysis.Rows.Count;i++){var row=analysis.Rows[i];mapping.Rows.Add(i+1,row.Frames.Count+" 格"+(row.SuspectOrder?"／變化較大":""),row.Action);}
        info.Text=analysis.Warning+note;ShowPreview();build.Enabled=true;
      }catch(Exception e){info.Text="分析未完成："+e.Message;}
      finally{busy=false;analyze.Enabled=mapping.Enabled=columns.Enabled=rows.Enabled=true;timer.Start();}
    }
    protected override void Dispose(bool disposing){if(disposing){timer.Dispose();if(preview.Image!=null)preview.Image.Dispose();if(analysis!=null)analysis.Dispose();original.Dispose();}base.Dispose(disposing);}
    public static void SelfTest(string root,string output){
      using(var pet=new PetLibrary(root,Path.Combine(output,"sheet-ui-library")).Load("lumi"))using(var dialog=new SpriteSheetImportDialog(pet.Image,null)){
        dialog.Show();Application.DoEvents();var deadline=DateTime.UtcNow.AddSeconds(20);while(dialog.busy&&DateTime.UtcNow<deadline){Application.DoEvents();System.Threading.Thread.Sleep(10);}Application.DoEvents();
        if(dialog.busy||!dialog.build.Enabled||dialog.mapping.Rows.Count!=11)throw new Exception("Whole-sheet import UI did not finish automatic analysis: "+dialog.info.Text+" busy="+dialog.busy+" rows="+dialog.mapping.Rows.Count);
        using(var shot=new Bitmap(dialog.Width,dialog.Height)){dialog.DrawToBitmap(shot,new Rectangle(0,0,shot.Width,shot.Height));shot.Save(Path.Combine(output,"sheet-import.png"),ImageFormat.Png);}
        dialog.fallback.Checked=false;dialog.build.PerformClick();if(dialog.Result==null||dialog.DialogResult!=DialogResult.OK)throw new Exception("Whole-sheet assemble UI failed");
        dialog.Result.Dispose();
      }
    }
  }
}
