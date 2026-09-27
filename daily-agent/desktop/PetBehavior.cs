using System;
using System.Drawing;
using System.Windows.Forms;

namespace DailyPet {
  static class PetAnimations {
    public static readonly string[] AmbientNames={"waving","jumping"};
    public static int LookDirection(Point cursor,Point origin){double angle=Math.Atan2(cursor.X-origin.X,-(cursor.Y-origin.Y))*180/Math.PI;return ((int)Math.Round((angle+360)/22.5))%16;}
    public static readonly string[] Names={"idle","running-right","running-left","waving","jumping","failed","waiting","running","review","look-upper","look-lower"};
    public static readonly int[] Counts={6,8,8,4,5,8,6,6,6,8,8};
    public static int Row(string state){
      for(int i=0;i<Names.Length;i++)if(Names[i]==state)return i;
      if(state=="reading"||state=="searching"||state=="thinking")return 7;
      if(state=="weather_alert"||state=="alert"||state=="sleepy")return 6;
      return 0;
    }
    public static int Interval(int row){return row==1||row==2?100:row==3||row==4?150:row==0||row>=9?250:180;}
  }

  // Desktop coordinates, including negative monitor origins. The entire pet stays inside.
  sealed class PetWander {
    readonly Random random;
    public Rectangle Area;
    public bool Enabled,Moving;
    public string Activity="idle";
    PointF position,target;
    Rectangle lastArea;Size lastSize;
    double nextDecision,lastTime;
    public PetWander(int seed){random=new Random(seed);}
    public static Rectangle Selection(Point a,Point b){return Rectangle.FromLTRB(Math.Min(a.X,b.X),Math.Min(a.Y,b.Y),Math.Max(a.X,b.X),Math.Max(a.Y,b.Y));}
    public static bool Fits(Rectangle area,Size pet){return pet.Width>0&&pet.Height>0&&area.Width>=pet.Width&&area.Height>=pet.Height;}
    public static Point Constrain(Point p,Rectangle area,Size pet){return new Point(Math.Max(area.Left,Math.Min(area.Right-pet.Width,p.X)),Math.Max(area.Top,Math.Min(area.Bottom-pet.Height,p.Y)));}
    public void Pause(double now){Moving=false;Activity="idle";lastTime=now;nextDecision=Math.Max(nextDecision,now+2);}
    public Point Step(Point current,Size size,double now,bool blocked){
      double dt=Math.Max(0,Math.Min(.1,now-lastTime));lastTime=now;
      if(Area!=lastArea||size!=lastSize){Moving=false;Activity="idle";nextDecision=now;lastArea=Area;lastSize=size;}
      if(!Enabled||blocked||!Fits(Area,size)){Pause(now);return current;}
      current=Constrain(current,Area,size);
      if(!Moving){
        position=current;
        if(now<nextDecision)return current;
        target=new PointF(Area.Left+random.Next(Area.Width-size.Width+1),Area.Top+random.Next(Area.Height-size.Height+1));
        if(Math.Abs(target.X-position.X)+Math.Abs(target.Y-position.Y)<24){nextDecision=now+3;return current;}
        Moving=true;Activity=target.X>=position.X?"running-right":"running-left";
      }
      double dx=target.X-position.X,dy=target.Y-position.Y,distance=Math.Sqrt(dx*dx+dy*dy),step=Math.Max(24,size.Width*.24)*dt;
      if(distance<=step){position=target;Moving=false;Activity="idle";nextDecision=now+8+random.Next(18);}
      else {position.X+=(float)(dx/distance*step);position.Y+=(float)(dy/distance*step);}
      return Constrain(Point.Round(position),Area,size);
    }
  }

  sealed class ActivityAreaPicker : Form {
    Point anchor,current;bool selecting;
    public Rectangle SelectedArea { get; private set; }
    public ActivityAreaPicker(){
      FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;
      Bounds=SystemInformation.VirtualScreen;BackColor=Color.FromArgb(20,36,32);Opacity=.55;DoubleBuffered=true;KeyPreview=true;Cursor=Cursors.Cross;
    }
    protected override void OnShown(EventArgs e){base.OnShown(e);Activate();Focus();}
    protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(e.Button==MouseButtons.Right){DialogResult=DialogResult.Cancel;Close();return;}if(e.Button==MouseButtons.Left){anchor=current=e.Location;selecting=true;Capture=true;Invalidate();}}
    protected override void OnMouseMove(MouseEventArgs e){base.OnMouseMove(e);if(selecting){current=e.Location;Invalidate();}}
    protected override void OnMouseUp(MouseEventArgs e){base.OnMouseUp(e);if(e.Button!=MouseButtons.Left||!selecting)return;selecting=false;current=e.Location;Capture=false;SelectedArea=PetWander.Selection(PointToScreen(anchor),PointToScreen(current));DialogResult=DialogResult.OK;Close();}
    protected override void OnKeyDown(KeyEventArgs e){if(e.KeyCode==Keys.Escape){DialogResult=DialogResult.Cancel;Close();}base.OnKeyDown(e);}
    public static void VerifyInput(){
      using(var picker=new ActivityAreaPicker()){
        IntPtr unused=picker.Handle;Point a=new Point(420,380),b=new Point(80,60);Rectangle expected=PetWander.Selection(picker.PointToScreen(a),picker.PointToScreen(b));
        picker.OnMouseDown(new MouseEventArgs(MouseButtons.Left,1,a.X,a.Y,0));picker.OnMouseMove(new MouseEventArgs(MouseButtons.Left,0,b.X,b.Y,0));picker.OnMouseUp(new MouseEventArgs(MouseButtons.Left,1,b.X,b.Y,0));
        if(picker.DialogResult!=DialogResult.OK||picker.SelectedArea!=expected)throw new Exception("Area mouse selection failed");
      }
      using(var picker=new ActivityAreaPicker()){IntPtr unused=picker.Handle;picker.OnKeyDown(new KeyEventArgs(Keys.Escape));if(picker.DialogResult!=DialogResult.Cancel||!picker.SelectedArea.IsEmpty)throw new Exception("Escape selection cancel failed");}
      using(var picker=new ActivityAreaPicker()){IntPtr unused=picker.Handle;picker.OnMouseDown(new MouseEventArgs(MouseButtons.Right,1,20,20,0));if(picker.DialogResult!=DialogResult.Cancel)throw new Exception("Right-button selection cancel failed");}
    }
    protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);
      var display=Screen.FromPoint(System.Windows.Forms.Cursor.Position).WorkingArea;Point label=PointToClient(new Point(display.Left+24,display.Top+24));
      using(var font=new Font("Microsoft JhengHei UI",16))using(var brush=new SolidBrush(Color.White))e.Graphics.DrawString("拖曳框選寵物活動區域 · Esc 或右鍵取消",font,brush,label);
      if(selecting){Rectangle area=PetWander.Selection(anchor,current);using(var fill=new SolidBrush(Color.FromArgb(78,190,166)))e.Graphics.FillRectangle(fill,area);using(var pen=new Pen(Color.White,3))e.Graphics.DrawRectangle(pen,area);}
    }
  }
}
