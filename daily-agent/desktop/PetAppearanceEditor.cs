using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DailyPet {
  // Local image editing only. No model, network, chat or memory dependencies.
  sealed class PetArtwork : IDisposable {
    public Bitmap Source;
    public bool Animated;
    public float Scale=1, OffsetX, OffsetY, Rotation, Brightness, Saturation=1;
    public bool Flip;
    readonly Stack<Bitmap> undo=new Stack<Bitmap>();
    public int CellWidth {get{return Animated?Source.Width/8:Source.Width;}}
    public int CellHeight {get{return Animated?Source.Height/11:Source.Height;}}
    public PetArtwork(Bitmap image,bool animated){Source=new Bitmap(image);Animated=animated;PetLibrary.Validate(Source,animated);}
    public void Remember(){
      // Bound undo by memory as well as operation count; large atlases retain fewer copies.
      int limit=Math.Max(1,Math.Min(12,(int)(96L*1024*1024/((long)Source.Width*Source.Height*4))));
      if(undo.Count>=limit){var items=undo.ToArray();items[items.Length-1].Dispose();undo.Clear();for(int i=items.Length-2;i>=0;i--)undo.Push(items[i]);}
      undo.Push(new Bitmap(Source));
    }
    public bool Undo(){if(undo.Count==0)return false;Source.Dispose();Source=undo.Pop();return true;}
    public void ResetTransform(){Scale=1;OffsetX=OffsetY=Rotation=Brightness=0;Saturation=1;Flip=false;}
    public Rectangle Cell(int row,int column){return new Rectangle(column*CellWidth,row*CellHeight,CellWidth,CellHeight);}
    public Matrix Transform(){
      var m=new Matrix();m.Translate(CellWidth*.5f+OffsetX*CellWidth,CellHeight*.5f+OffsetY*CellHeight);
      m.Rotate(Rotation);m.Scale(Flip?-Scale:Scale,Scale);m.Translate(-CellWidth*.5f,-CellHeight*.5f);return m;
    }
    public Bitmap Frame(int row,int column){
      var result=new Bitmap(CellWidth,CellHeight,PixelFormat.Format32bppPArgb);
      using(var input=Source.Clone(Cell(row,column),PixelFormat.Format32bppPArgb))using(var g=Graphics.FromImage(result))using(var m=Transform())using(var attr=new ImageAttributes()){
        g.Clear(Color.Transparent);g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.Transform=m;
        float s=Saturation,ir=.213f*(1-s),ig=.715f*(1-s),ib=.072f*(1-s);
        attr.SetColorMatrix(new ColorMatrix(new float[][]{
          new float[]{ir+s,ir,ir,0,0},new float[]{ig,ig+s,ig,0,0},new float[]{ib,ib,ib+s,0,0},new float[]{0,0,0,1,0},new float[]{Brightness,Brightness,Brightness,0,1}}));
        attr.SetWrapMode(WrapMode.TileFlipXY);
        g.DrawImage(input,new Rectangle(0,0,CellWidth,CellHeight),0,0,CellWidth,CellHeight,GraphicsUnit.Pixel,attr);
      }return result;
    }
    public Bitmap Render(){
      var result=new Bitmap(Source.Width,Source.Height,PixelFormat.Format32bppPArgb);
      using(var g=Graphics.FromImage(result)){g.Clear(Color.Transparent);g.CompositingMode=CompositingMode.SourceCopy;
        for(int row=0;row<(Animated?11:1);row++)for(int col=0;col<(Animated?8:1);col++)using(var frame=Frame(row,col))g.DrawImageUnscaled(frame,col*CellWidth,row*CellHeight);
      }return result;
    }
    public void Stroke(int row,int col,PointF from,PointF to,float diameter,Color color,bool erase){
      using(var m=Transform()){
        m.Invert();var p=new PointF[]{from,to};m.TransformPoints(p);
        for(int i=0;i<2;i++){p[i].X+=col*CellWidth;p[i].Y+=row*CellHeight;}
        using(var g=Graphics.FromImage(Source))using(var pen=new Pen(erase?Color.Transparent:color,diameter/Scale)){
          g.SetClip(Cell(row,col));g.CompositingMode=erase?CompositingMode.SourceCopy:CompositingMode.SourceOver;
          g.SmoothingMode=erase?SmoothingMode.None:SmoothingMode.AntiAlias;pen.StartCap=pen.EndCap=LineCap.Round;
          if(from==to){using(var brush=new SolidBrush(erase?Color.Transparent:color))g.FillEllipse(brush,p[0].X-pen.Width/2,p[0].Y-pen.Width/2,pen.Width,pen.Width);}else g.DrawLine(pen,p[0],p[1]);
        }
      }
    }
    public void CenterVisible(int row,int col){
      Rectangle bounds=Rectangle.Empty;Rectangle cell=Cell(row,col);
      for(int y=0;y<cell.Height;y++)for(int x=0;x<cell.Width;x++)if(Source.GetPixel(cell.X+x,cell.Y+y).A>16){var pixel=new Rectangle(x,y,1,1);bounds=bounds.IsEmpty?pixel:Rectangle.Union(bounds,pixel);}
      if(bounds.IsEmpty)throw new Exception("這一格沒有可見的角色。");
      ResetTransform();Scale=Math.Max(.1f,Math.Min(2.5f,Math.Min(CellWidth*.86f/bounds.Width,CellHeight*.9f/bounds.Height)));
      OffsetX=Math.Max(-1,Math.Min(1,(CellWidth*.5f-(bounds.Left+bounds.Width*.5f))*Scale/CellWidth));
      OffsetY=Math.Max(-1,Math.Min(1,(CellHeight*.5f-(bounds.Top+bounds.Height*.5f))*Scale/CellHeight));
    }
    public void RemoveEdgeBackground(int row,int col,int tolerance){
      // Flood fill only edge-connected pixels matching corner colors; preserve enclosed white details.
      Rectangle cell=Cell(row,col);int w=cell.Width,h=cell.Height;
      using(var frame=Source.Clone(cell,PixelFormat.Format32bppArgb)){
        var data=frame.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);
        try{
          byte[] bytes=new byte[w*h*4];for(int y=0;y<h;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),bytes,y*w*4,w*4);
          int[] corners={0,w-1,(h-1)*w,h*w-1};var colors=new List<byte[]>();foreach(int corner in corners){int c=corner*4;if(bytes[c+3]>0)colors.Add(new byte[]{bytes[c],bytes[c+1],bytes[c+2]});}var seen=new bool[w*h];var queue=new Queue<int>();
          for(int x=0;x<w;x++){queue.Enqueue(x);queue.Enqueue((h-1)*w+x);}for(int y=1;y<h-1;y++){queue.Enqueue(y*w);queue.Enqueue(y*w+w-1);}
          while(queue.Count>0){int i=queue.Dequeue();if(seen[i])continue;seen[i]=true;int p=i*4;bool match=bytes[p+3]==0;
            foreach(var color in colors){if(Math.Max(Math.Abs(bytes[p]-color[0]),Math.Max(Math.Abs(bytes[p+1]-color[1]),Math.Abs(bytes[p+2]-color[2])))<=tolerance){match=true;break;}}
            if(!match)continue;bytes[p+3]=0;
            if(i%w>0)queue.Enqueue(i-1);if(i%w<w-1)queue.Enqueue(i+1);if(i>=w)queue.Enqueue(i-w);if(i<(h-1)*w)queue.Enqueue(i+w);
          }
          for(int y=0;y<h;y++)Marshal.Copy(bytes,y*w*4,IntPtr.Add(data.Scan0,y*data.Stride),w*4);
        }finally{frame.UnlockBits(data);}
        using(var g=Graphics.FromImage(Source)){g.CompositingMode=CompositingMode.SourceCopy;g.DrawImageUnscaled(frame,cell.X,cell.Y);}
      }
    }
    public void Dispose(){if(Source!=null)Source.Dispose();foreach(var image in undo)image.Dispose();undo.Clear();}
  }

  sealed class ArtworkCanvas : Control {
    public Action<PaintEventArgs> Draw;
    public ArtworkCanvas(){DoubleBuffered=true;ResizeRedraw=true;BackColor=Color.FromArgb(239,240,244);}
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(Draw!=null)Draw(e);}
  }

  sealed class PetAppearanceEditor : Form {
    readonly PetLibrary library;
    readonly Api localApi;
    PetArtwork artwork;
    readonly ArtworkCanvas canvas=new ArtworkCanvas();
    readonly Label hint=new Label(),frameInfo=new Label();
    readonly TextBox name=new TextBox();
    readonly ComboBox state=new ComboBox(),tool=new ComboBox(),background=new ComboBox();
    readonly TrackBar scale=new TrackBar(),offsetX=new TrackBar(),offsetY=new TrackBar(),rotation=new TrackBar(),brightness=new TrackBar(),saturation=new TrackBar(),brushSize=new TrackBar(),tolerance=new TrackBar(),frameIndex=new TrackBar();
    readonly CheckBox flip=new CheckBox(),play=new CheckBox();
    readonly Timer animation=new Timer();
    Color brushColor=Color.FromArgb(235,96,135);
    Rectangle preview;
    bool updating,painting,dirty;
    PointF lastPoint;
    public PetAppearance Saved;
    public PetAppearanceEditor(PetLibrary library,PetAppearance initial,bool standalone=false,Api localApi=null){
      this.library=library;this.localApi=localApi;Text="Daily Agent｜寵物動畫整理與外觀編輯器";Font=new Font("Microsoft JhengHei UI",10);ClientSize=new Size(1040,720);MinimumSize=new Size(900,740);StartPosition=FormStartPosition.CenterScreen;AutoScaleMode=AutoScaleMode.Dpi;
      canvas.SetBounds(18,18,640,590);canvas.Anchor=AnchorStyles.Top|AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Bottom;Controls.Add(canvas);canvas.Draw=DrawPreview;
      hint.SetBounds(18,620,640,70);hint.Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Bottom;hint.Text="匯入圖片後可去背、補色或擦除邊緣。\n修改只存成新外觀；原圖保留。";Controls.Add(hint);
      var panel=new Panel();panel.SetBounds(680,18,340,180);panel.Anchor=AnchorStyles.Top|AnchorStyles.Right;Controls.Add(panel);
      int y=0;AddButton(panel,"匯入整張 GPT 動畫圖，自動整理",ref y,ImportSheet);AddButton(panel,"一般圖片／既有動畫 ZIP",ref y,Import);AddLabel(panel,"外觀名稱",ref y);name.SetBounds(0,y,305,28);panel.Controls.Add(name);
      var tabs=new TabControl();tabs.SetBounds(680,208,340,400);tabs.Anchor=AnchorStyles.Top|AnchorStyles.Right|AnchorStyles.Bottom;Controls.Add(tabs);
      var adjust=new TabPage("大小與色彩"){AutoScroll=true};var paint=new TabPage("去背與補色"){AutoScroll=true};var motion=new TabPage("動畫預覽"){AutoScroll=true};tabs.TabPages.AddRange(new[]{adjust,paint,motion});
      y=8;AddLabel(adjust,"可在左邊拖曳角色；調整套用所有影格",ref y);
      AddSlider(adjust,"角色大小 %",scale,10,250,100,ref y);AddSlider(adjust,"左右位置 %",offsetX,-100,100,0,ref y);AddSlider(adjust,"上下位置 %",offsetY,-100,100,0,ref y);AddSlider(adjust,"旋轉角度",rotation,-180,180,0,ref y);AddSlider(adjust,"明暗",brightness,-50,50,0,ref y);AddSlider(adjust,"色彩濃度 %",saturation,0,200,100,ref y);
      flip.Text="左右鏡像";flip.SetBounds(0,y,305,30);adjust.Controls.Add(flip);y+=36;
      AddButton(adjust,"自動置中並裁掉多餘留白",ref y,delegate{if(artwork==null)return;artwork.CenterVisible(Row,Column);dirty=true;ReadSettings();canvas.Invalidate();});
      AddButton(adjust,"重設大小、位置與顏色",ref y,delegate{if(artwork==null)return;artwork.ResetTransform();ReadSettings();dirty=true;canvas.Invalidate();});
      y=8;AddLabel(paint,"選擇工具後在左邊畫；只改目前影格",ref y);tool.DropDownStyle=ComboBoxStyle.DropDownList;tool.Items.AddRange(new object[]{"移動角色","橡皮擦","補色畫筆","吸取顏色"});tool.SelectedIndex=0;tool.SetBounds(0,y,305,30);paint.Controls.Add(tool);y+=40;
      AddButton(paint,"選擇畫筆顏色",ref y,delegate{using(var d=new ColorDialog{Color=brushColor,FullOpen=true})if(d.ShowDialog(this)==DialogResult.OK)brushColor=d.Color;});
      AddSlider(paint,"畫筆大小（像素）",brushSize,1,100,12,ref y);
      AddButton(paint,"復原上一步筆畫／去背",ref y,delegate{if(artwork!=null&&artwork.Undo()){dirty=true;canvas.Invalidate();}});
      AddSlider(paint,"去背容差（越小越保守）",tolerance,0,100,16,ref y);
      AddButton(paint,"移除邊緣相連背景（目前這一格）",ref y,delegate{if(artwork==null)return;StopPlayback();artwork.Remember();artwork.RemoveEdgeBackground(Row,Column,tolerance.Value);dirty=true;canvas.Invalidate();});
      y=8;AddLabel(motion,"動畫狀態（靜態圖不需要）",ref y);state.DropDownStyle=ComboBoxStyle.DropDownList;state.Items.AddRange(SpriteSheetAnalyzer.ActionLabels);state.SelectedIndex=0;state.SetBounds(0,y,305,30);motion.Controls.Add(state);y+=40;
      AddSlider(motion,"目前影格",frameIndex,0,7,0,ref y);frameInfo.SetBounds(0,y,305,24);motion.Controls.Add(frameInfo);y+=28;
      play.Text="播放動畫預覽";play.SetBounds(0,y,305,30);motion.Controls.Add(play);y+=36;
      AddLabel(motion,"預覽底色（不會存進圖片）",ref y);background.DropDownStyle=ComboBoxStyle.DropDownList;background.Items.AddRange(new object[]{"透明棋盤","深色","白色"});background.SelectedIndex=0;background.SetBounds(0,y,305,30);motion.Controls.Add(background);
      var export=new Button{Text="匯出 PNG／動畫 ZIP"};export.SetBounds(680,620,340,36);export.Anchor=AnchorStyles.Right|AnchorStyles.Bottom;Controls.Add(export);export.Click+=delegate{try{Export();}catch(Exception e){MessageBox.Show(this,e.Message,"匯出");}};
      var save=new Button{Text=standalone?"儲存新外觀（到桌寵選單選用）":"儲存為新外觀並套用"};save.SetBounds(680,664,340,36);save.Anchor=AnchorStyles.Right|AnchorStyles.Bottom;Controls.Add(save);save.Click+=delegate{try{Save();}catch(Exception e){MessageBox.Show(this,e.Message,"儲存");}};
      tabs.SelectedIndexChanged+=delegate{StopPlayback();if(tabs.SelectedTab==adjust)tool.SelectedIndex=0;};
      foreach(var slider in new[]{scale,offsetX,offsetY,rotation,brightness,saturation})slider.ValueChanged+=delegate{WriteSettings();};flip.CheckedChanged+=delegate{WriteSettings();};
      frameIndex.ValueChanged+=delegate{canvas.Invalidate();};state.SelectedIndexChanged+=delegate{StopPlayback();UpdateFrameRange();};background.SelectedIndexChanged+=delegate{canvas.Invalidate();};
      animation.Interval=250;animation.Tick+=delegate{if(artwork!=null&&artwork.Animated){frameIndex.Value=(frameIndex.Value+1)%PetAnimations.Counts[Row];}};play.CheckedChanged+=delegate{if(play.Checked&&artwork!=null&&artwork.Animated)animation.Start();else animation.Stop();};
      canvas.MouseDown+=BeginStroke;canvas.MouseMove+=ContinueStroke;canvas.MouseUp+=delegate{painting=false;canvas.Capture=false;};canvas.MouseCaptureChanged+=delegate{if(!canvas.Capture)painting=false;};
      canvas.AllowDrop=true;canvas.DragEnter+=delegate(object sender,DragEventArgs e){if(e.Data.GetDataPresent(DataFormats.FileDrop))e.Effect=DragDropEffects.Copy;};canvas.DragDrop+=delegate(object sender,DragEventArgs e){try{var files=(string[])e.Data.GetData(DataFormats.FileDrop);if(files.Length==1)ImportSheetFile(files[0]);}catch(Exception error){MessageBox.Show(this,error.Message,"動畫圖匯入");}};
      FormClosing+=delegate(object sender,FormClosingEventArgs e){if(dirty&&Saved==null&&MessageBox.Show(this,"尚未儲存，要放棄這次修改嗎？","寵物外觀",MessageBoxButtons.YesNo)==DialogResult.No)e.Cancel=true;};
      if(initial!=null)LoadArtwork(initial.Image,initial.Animated,initial.Name+"（微調）");
    }
    int Row{get{return artwork!=null&&artwork.Animated?Math.Max(0,state.SelectedIndex):0;}}
    int Column{get{return artwork!=null&&artwork.Animated?frameIndex.Value:0;}}
    void AddLabel(Control parent,string text,ref int y){var label=new Label{Text=text};label.SetBounds(0,y,305,30);parent.Controls.Add(label);y+=32;}
    void AddButton(Control parent,string text,ref int y,Action action){var button=new Button{Text=text};button.SetBounds(0,y,305,36);parent.Controls.Add(button);y+=44;button.Click+=delegate{try{action();}catch(Exception e){MessageBox.Show(this,e.Message,"外觀編輯器");}};}
    void AddSlider(Control parent,string text,TrackBar slider,int min,int max,int value,ref int y){var label=new Label{Text=text+"："+value};label.SetBounds(0,y,305,24);parent.Controls.Add(label);y+=24;slider.Minimum=min;slider.Maximum=max;slider.Value=value;slider.TickStyle=TickStyle.None;slider.SetBounds(0,y,305,34);parent.Controls.Add(slider);y+=40;slider.ValueChanged+=delegate{label.Text=text+"："+slider.Value;};}
    void LoadArtwork(Bitmap image,bool animated,string title){if(artwork!=null)artwork.Dispose();artwork=new PetArtwork(image,animated);name.Text=title;dirty=false;state.Enabled=play.Enabled=animated;ReadSettings();UpdateFrameRange();canvas.Invalidate();}
    void UpdateFrameRange(){if(artwork==null)return;frameIndex.Value=0;frameIndex.Maximum=artwork.Animated?(Row==0?6:PetAnimations.Counts[Row]-1):0;frameIndex.Enabled=artwork.Animated;animation.Interval=PetAnimations.Interval(Row);canvas.Invalidate();}
    void StopPlayback(){play.Checked=false;animation.Stop();}
    void ReadSettings(){updating=true;scale.Value=(int)Math.Round(artwork.Scale*100);offsetX.Value=Math.Max(-100,Math.Min(100,(int)Math.Round(artwork.OffsetX*100)));offsetY.Value=Math.Max(-100,Math.Min(100,(int)Math.Round(artwork.OffsetY*100)));rotation.Value=(int)artwork.Rotation;brightness.Value=(int)(artwork.Brightness*100);saturation.Value=(int)(artwork.Saturation*100);flip.Checked=artwork.Flip;updating=false;}
    void WriteSettings(){if(updating||artwork==null)return;artwork.Scale=scale.Value/100f;artwork.OffsetX=offsetX.Value/100f;artwork.OffsetY=offsetY.Value/100f;artwork.Rotation=rotation.Value;artwork.Brightness=brightness.Value/100f;artwork.Saturation=saturation.Value/100f;artwork.Flip=flip.Checked;dirty=true;canvas.Invalidate();}
    void Import(){
      if(dirty&&MessageBox.Show(this,"匯入其他圖片會放棄尚未儲存的修改，繼續嗎？","匯入",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;
      using(var dialog=new OpenFileDialog{Filter="圖片或 v2 動畫包|*.png;*.jpg;*.jpeg;*.webp;*.zip",CheckFileExists=true,RestoreDirectory=true})if(dialog.ShowDialog(this)==DialogResult.OK){StopPlayback();
        if(Path.GetExtension(dialog.FileName).ToLowerInvariant()==".zip"){using(var pet=library.Import(dialog.FileName))LoadArtwork(pet.Image,pet.Animated,pet.Name+"（微調）");}
        else using(var image=library.ReadChatBitmap(dialog.FileName))LoadArtwork(image,false,Path.GetFileNameWithoutExtension(dialog.FileName));
      }
    }
    void ImportSheet(){using(var dialog=new OpenFileDialog{Title="選擇 GPT 生成的整張動畫圖",Filter="動畫精靈圖|*.png;*.jpg;*.jpeg;*.webp",CheckFileExists=true,RestoreDirectory=true})if(dialog.ShowDialog(this)==DialogResult.OK)ImportSheetFile(dialog.FileName);}
    void ImportSheetFile(string file){
      if(dirty&&MessageBox.Show(this,"載入新的動畫圖會放棄尚未儲存的修改，繼續嗎？","動畫圖匯入",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;
      StopPlayback();using(var image=library.ReadChatBitmap(file))using(var wizard=new SpriteSheetImportDialog(image,localApi)){
        if(wizard.ShowDialog(this)!=DialogResult.OK||wizard.Result==null)return;
        using(wizard.Result)LoadArtwork(wizard.Result,true,Path.GetFileNameWithoutExtension(file));dirty=true;
        MessageBox.Show(this,wizard.Report,"動畫整理結果：請播放確認");state.SelectedIndex=0;play.Checked=true;
      }
    }
    void DrawPreview(PaintEventArgs e){
      var g=e.Graphics;if(artwork==null){g.DrawString("匯入一張圖片開始製作",Font,Brushes.DimGray,30,30);return;}
      int w=canvas.Width,h=canvas.Height;float fit=Math.Min((w-32f)/artwork.CellWidth,(h-130f)/artwork.CellHeight);
      preview=new Rectangle((w-(int)(artwork.CellWidth*fit))/2,16,(int)(artwork.CellWidth*fit),(int)(artwork.CellHeight*fit));
      if(background.SelectedIndex==0){for(int y=preview.Top;y<preview.Bottom;y+=16)for(int x=preview.Left;x<preview.Right;x+=16)g.FillRectangle(((x-preview.Left)/16+(y-preview.Top)/16)%2==0?Brushes.White:Brushes.LightGray,new Rectangle(x,y,Math.Min(16,preview.Right-x),Math.Min(16,preview.Bottom-y)));}
      else g.FillRectangle(background.SelectedIndex==1?Brushes.DimGray:Brushes.White,preview);
      using(var frame=artwork.Frame(Row,Column)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(frame,preview);g.DrawRectangle(Pens.Gray,preview);
        int y=h-106;g.DrawString("實際縮小預覽",Font,Brushes.DimGray,20,y);g.DrawImage(frame,new Rectangle(20,y+25,48,52));g.DrawImage(frame,new Rectangle(100,y+20,72,78));g.DrawImage(frame,new Rectangle(210,y+10,96,104));
      }
      frameInfo.Text=artwork.Animated?(Row==0&&Column==6?"中立姿勢（選填）":SpriteSheetAnalyzer.ActionLabels[Row]+"　第 "+(Column+1)+" 格"):"靜態外觀";
      hint.Text="原始尺寸 "+artwork.Source.Width+" × "+artwork.Source.Height+"　／　單格 "+artwork.CellWidth+" × "+artwork.CellHeight+"\n去背只移除與邊界相連的顏色；擦掉太多可復原。儲存後可在桌寵選單傳送到手機。";
    }
    PointF CanvasPoint(Point point){return new PointF((point.X-preview.X)*(float)artwork.CellWidth/preview.Width,(point.Y-preview.Y)*(float)artwork.CellHeight/preview.Height);}
    void BeginStroke(object sender,MouseEventArgs e){if(e.Button!=MouseButtons.Left||artwork==null||!preview.Contains(e.Location))return;StopPlayback();lastPoint=CanvasPoint(e.Location);
      if(tool.SelectedIndex==3){using(var frame=artwork.Frame(Row,Column))brushColor=frame.GetPixel(Math.Min(frame.Width-1,(int)lastPoint.X),Math.Min(frame.Height-1,(int)lastPoint.Y));tool.SelectedIndex=2;return;}
      painting=true;canvas.Capture=true;if(tool.SelectedIndex==1||tool.SelectedIndex==2){artwork.Remember();artwork.Stroke(Row,Column,lastPoint,lastPoint,brushSize.Value,brushColor,tool.SelectedIndex==1);}dirty=true;canvas.Invalidate();
    }
    void ContinueStroke(object sender,MouseEventArgs e){if(!painting||artwork==null)return;PointF point=CanvasPoint(e.Location);
      if(tool.SelectedIndex==0){artwork.OffsetX=Math.Max(-1,Math.Min(1,artwork.OffsetX+(point.X-lastPoint.X)/artwork.CellWidth));artwork.OffsetY=Math.Max(-1,Math.Min(1,artwork.OffsetY+(point.Y-lastPoint.Y)/artwork.CellHeight));ReadSettings();}
      else artwork.Stroke(Row,Column,lastPoint,point,brushSize.Value,brushColor,tool.SelectedIndex==1);lastPoint=point;canvas.Invalidate();
    }
    void Export(){if(artwork==null)return;using(var image=artwork.Render()){PetLibrary.Validate(image,artwork.Animated,true);using(var dialog=new SaveFileDialog{Filter=artwork.Animated?"v2 動畫包|*.zip":"透明 PNG|*.png",FileName=artwork.Animated?"my-pet.zip":"my-pet.png",RestoreDirectory=true})if(dialog.ShowDialog(this)==DialogResult.OK){
        // Write beside the destination first so export errors cannot destroy the previous file.
        ExportFile(image,artwork.Animated,name.Text,dialog.FileName);
      }}
    }
    static void ExportFile(Bitmap image,bool animated,string title,string destination){
        PetLibrary.Validate(image,animated,true);
        string tmp=destination+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{if(!animated)image.Save(tmp,ImageFormat.Png);else using(var zip=ZipFile.Open(tmp,ZipArchiveMode.Create)){
          using(var output=zip.CreateEntry("spritesheet.png").Open())image.Save(output,ImageFormat.Png);
          using(var output=new StreamWriter(zip.CreateEntry("pet.json").Open()))output.Write(Json.Encode(new{displayName=title,chatName=title,spriteVersionNumber=2,spritesheetPath="spritesheet.png"}));
        }if(File.Exists(destination))File.Replace(tmp,destination,null);else File.Move(tmp,destination);}finally{if(File.Exists(tmp))File.Delete(tmp);}
    }
    void Save(){if(artwork==null)return;using(var image=artwork.Render())Saved=library.SaveEdited(image,artwork.Source,artwork.Animated,name.Text);dirty=false;DialogResult=DialogResult.OK;Close();}
    protected override void Dispose(bool disposing){if(disposing){animation.Dispose();if(artwork!=null){artwork.Dispose();artwork=null;}}base.Dispose(disposing);}
    public static void SelfTest(string root,string output){
      Directory.CreateDirectory(output);var library=new PetLibrary(root,Path.Combine(output,"editor-library"));var checks=new List<string>();
      using(var source=new Bitmap(192,208,PixelFormat.Format32bppPArgb)){
        using(var g=Graphics.FromImage(source)){g.Clear(Color.White);g.FillEllipse(Brushes.Crimson,40,40,112,128);g.FillEllipse(Brushes.White,84,84,24,24);}
        using(var art=new PetArtwork(source,false)){
          art.Remember();art.RemoveEdgeBackground(0,0,0);if(art.Source.GetPixel(0,0).A!=0||art.Source.GetPixel(94,94).A==0)throw new Exception("Background removal damaged enclosed detail");checks.Add("edge-background-preserves-enclosed-details");
          art.Remember();art.Stroke(0,0,new PointF(94,94),new PointF(94,94),18,Color.Black,true);if(art.Source.GetPixel(94,94).A!=0)throw new Exception("Eraser failed");if(!art.Undo()||art.Source.GetPixel(94,94).A==0)throw new Exception("Undo failed");checks.Add("eraser-and-undo");
          art.Scale=.5f;art.OffsetX=.1f;using(var rendered=art.Render()){using(var saved=library.SaveEdited(rendered,art.Source,false,"測試微調"))using(var reload=library.Load(saved.Id)){if(reload.Name!="測試微調"||reload.Image.Width!=192||reload.Image.GetPixel(0,0).A!=0)throw new Exception("Edited skin persistence failed");checks.Add("save-reload-with-original-retained");
            using(var editor=new PetAppearanceEditor(library,reload)){editor.Show();Application.DoEvents();using(var shot=new Bitmap(editor.Width,editor.Height)){editor.DrawToBitmap(shot,new Rectangle(0,0,shot.Width,shot.Height));shot.Save(Path.Combine(output,"pet-editor.png"),ImageFormat.Png);}editor.Close();}
          }}
          if(source.GetPixel(0,0).A!=255)throw new Exception("Original source changed");
        }
      }
      using(var pet=library.Load("lumi"))using(var art=new PetArtwork(pet.Image,true)){
        using(var opaque=new Bitmap(pet.Image.Width,pet.Image.Height,PixelFormat.Format32bppPArgb)){
          using(var g=Graphics.FromImage(opaque)){g.Clear(Color.White);g.DrawImageUnscaled(pet.Image,0,0);}
          using(var sheet=SpriteSheetAnalyzer.Analyze(opaque,0,0,18)){
            if(sheet.Rows.Count!=11||sheet.Columns!=8||!sheet.StandardLayout)throw new Exception("Standard whole-sheet detection failed");
            for(int row=0;row<11;row++)if(sheet.Rows[row].Frames.Count!=PetAnimations.Counts[row])throw new Exception("Whole-sheet frame splitting failed at "+row);
            string report;using(var assembled=SpriteSheetAnalyzer.Build(sheet,true,false,false,out report)){PetLibrary.Validate(assembled,true,true);assembled.Save(Path.Combine(output,"sheet-assembled.png"),ImageFormat.Png);checks.Add("opaque-whole-sheet-detect-split-background-align-and-assemble");}
          }
        }
        art.Scale=.85f;art.OffsetY=.03f;art.Rotation=3;
        using(var result=art.Render()){
          PetLibrary.Validate(result,true,true);if(result.Width!=pet.Image.Width||result.Height!=pet.Image.Height)throw new Exception("Atlas dimensions changed");checks.Add("animated-transform-preserves-88-cell-layout-and-reserves");
          string zip=Path.Combine(output,"editor-export.zip");ExportFile(result,true,"動畫微調",zip);ExportFile(result,true,"動畫微調",zip);
          using(var imported=library.Import(zip)){if(!imported.Animated||imported.Name!="動畫微調")throw new Exception("Exported ZIP cannot be imported");checks.Add("animated-export-replace-and-reimport");}
        }
        using(var editor=new PetAppearanceEditor(library,pet)){
          editor.Show();Application.DoEvents();if(editor.tool.Text!="移動角色"||editor.scale.Value!=100)throw new Exception("Editor initial controls failed");
          using(var shot=new Bitmap(editor.Width,editor.Height)){editor.DrawToBitmap(shot,new Rectangle(0,0,shot.Width,shot.Height));shot.Save(Path.Combine(output,"pet-editor-lumi.png"),ImageFormat.Png);}
          editor.tool.SelectedIndex=2;var area=editor.preview;var point=new Point(area.X+area.Width/2,area.Y+area.Height/2);
          editor.BeginStroke(editor.canvas,new MouseEventArgs(MouseButtons.Left,1,point.X,point.Y,0));editor.ContinueStroke(editor.canvas,new MouseEventArgs(MouseButtons.Left,0,point.X+10,point.Y,0));editor.painting=false;editor.canvas.Capture=false;
          if(!editor.artwork.Undo())throw new Exception("UI brush did not remember stroke");editor.dirty=false;editor.Close();checks.Add("ui-brush-coordinate-mapping-and-undo");
        }
      }
      using(var irregular=new Bitmap(480,400,PixelFormat.Format32bppPArgb)){
        using(var g=Graphics.FromImage(irregular)){g.Clear(Color.White);for(int row=0;row<2;row++)for(int col=0;col<4;col++)g.FillEllipse(Brushes.DarkOrchid,20+col*120,20+row*200,80,160);}
        using(var sheet=SpriteSheetAnalyzer.Analyze(irregular,0,0,16)){
          if(sheet.Rows.Count!=2||sheet.Columns!=4||sheet.Rows[0].Frames.Count!=4)throw new Exception("Automatic custom grid detection failed");
          sheet.Rows[0].Action="idle";sheet.Rows[1].Action="waving";string report;
          bool rejected=false;try{using(var incomplete=SpriteSheetAnalyzer.Build(sheet,true,false,false,out report)){} }catch{rejected=true;}if(!rejected)throw new Exception("Missing motions silently accepted");
          using(var assembled=SpriteSheetAnalyzer.Build(sheet,true,true,true,out report)){PetLibrary.Validate(assembled,true,true);if(!report.Contains("未補畫"))throw new Exception("Fallback not disclosed");checks.Add("custom-grid-and-explicit-missing-motion-fallback");}
        }
      }
      SpriteSheetImportDialog.SelfTest(root,output);checks.Add("whole-sheet-import-ui-auto-analysis-and-assemble");
      File.WriteAllText(Path.Combine(output,"pet-editor-test.json"),Json.Encode(new{passed=true,checks=checks}));
    }
  }
}
