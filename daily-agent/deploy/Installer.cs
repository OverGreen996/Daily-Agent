using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using DailyUi;
class Installer {
  static void Extract(string stage) {
    Directory.CreateDirectory(stage);
    string zip=Path.Combine(stage,"package.zip");
    var assembly=Assembly.GetExecutingAssembly();
    using(var input=assembly.GetManifestResourceStream("DailyAgent.Package")) {
      if(input==null)throw new Exception("安裝檔不完整，請重新下載最新版 DailyAgent-Setup.exe。");
      using(var output=File.Create(zip))input.CopyTo(output);
    }
    string expected;
    using(var input=assembly.GetManifestResourceStream("DailyAgent.Hash"))
    using(var reader=new StreamReader(input))expected=reader.ReadToEnd().Trim().Split(' ')[0];
    using(var h=SHA256.Create())using(var s=File.OpenRead(zip))
      if(!String.Equals(BitConverter.ToString(h.ComputeHash(s)).Replace("-",""),expected,StringComparison.OrdinalIgnoreCase))throw new Exception("安裝檔校驗失敗，請重新下載。尚未安裝或執行程式。");
    string payload=Path.Combine(stage,"payload");
    using(var archive=ZipFile.OpenRead(zip))foreach(var e in archive.Entries)
      if(!Path.GetFullPath(Path.Combine(payload,e.FullName)).StartsWith(payload+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("安裝檔包含不安全的路徑。");
    ZipFile.ExtractToDirectory(zip,payload);
    File.Delete(zip);
  }
  static void Install(string stage,string destination) {
    Extract(stage);
    var start=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(stage,"payload","Install-DailyAgent.ps1")+"\" -Destination \""+destination+"\"");
    start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardError=true;
    using(var p=Process.Start(start)){string error=p.StandardError.ReadToEnd();p.WaitForExit();if(p.ExitCode!=0)throw new Exception(error);}
  }
  [STAThread] static int Main(string[] args) {
    // Test extraction without installing, creating shortcuts or downloading models.
    if(args.Length==2&&args[0]=="--extract-only") {
      try{if(Directory.Exists(args[1]))return 2;Extract(Path.GetFullPath(args[1]));return 0;}catch{return 1;}
    }
    Application.EnableVisualStyles();
    string destination=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"DailyAgent");
    var form=new Form{Text="Daily Agent｜安裝",ClientSize=new Size(610,460),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedSingle,MaximizeBox=false};
    Theme.Apply(form);
    var brand=new Label{Left=28,Top=24,Width=550,Height=37,ForeColor=Theme.Text,Font=new Font("Segoe UI",21,FontStyle.Bold),Text="Daily Agent"};
    var subtitle=new Label{Left=30,Top=70,Width=550,Height=25,ForeColor=Theme.Muted,Text="你的日常助理，安裝後就能開始。"};
    var card=new Card{Left=28,Top=110,Width=554,Height=177};
    var label=new Label{Left=18,Top=16,Width=372,Height=98,ForeColor=Theme.Text,BackColor=Color.Transparent,Text="聊天 · 記憶 · 行程\n\n不用解壓縮、PowerShell 或雲端登入。\n基本版首次預留約 12 GB 空間。\n生圖等功能可稍後再裝。"};
    var location=new Label{Left=18,Top=118,Width=372,Height=49,ForeColor=Theme.Muted,BackColor=Color.Transparent,AutoEllipsis=true,Text="安裝位置："+destination};
    Image qr=null;
    using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("DailyAgent.AndroidQr")){if(stream!=null)using(var original=Image.FromStream(stream))qr=new Bitmap(original);}
    var phone=new PictureBox{Left=400,Top=8,Width=147,Height=147,Image=qr,SizeMode=PictureBoxSizeMode.CenterImage,Cursor=Cursors.Hand,AccessibleName="手機掃碼下載 APK"};
    phone.Click+=(s,e)=>AndroidDownload.Show(form,qr);
    var phoneLabel=new Label{Left=394,Top=155,Width=153,Height=20,ForeColor=Theme.Muted,BackColor=Color.Transparent,Text="手機掃碼下載 APK",TextAlign=ContentAlignment.MiddleCenter};
    card.Controls.AddRange(new Control[]{phone,phoneLabel});form.FormClosed+=(s,e)=>{if(qr!=null)qr.Dispose();};
    card.Controls.AddRange(new Control[]{label,location});
    var configure=new CheckBox{Left=30,Top=305,Width=550,Height=27,Checked=true,ForeColor=Theme.Text,Text="安裝後自動準備基本功能（建議）"};
    var progress=new ProgressBar{Left=30,Top=349,Width=550,Height=5,Style=ProgressBarStyle.Marquee,Visible=false};
    var button=new ActionButton{Left=338,Top=372,Width=244,Height=42,Primary=true,Text="安裝並開始使用"};
    var browse=new ActionButton{Left=28,Top=372,Width=190,Height=42,Text="變更安裝位置"};
    browse.Click+=(s,e)=>{using(var picker=new FolderBrowserDialog{Description="選擇磁碟或資料夾，會在裡面建立 DailyAgent 資料夾。",SelectedPath=Directory.Exists(destination)?destination:Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}){if(picker.ShowDialog(form)==DialogResult.OK){destination=Path.GetFileName(picker.SelectedPath.TrimEnd(Path.DirectorySeparatorChar)).Equals("DailyAgent",StringComparison.OrdinalIgnoreCase)?picker.SelectedPath:Path.Combine(picker.SelectedPath,"DailyAgent");location.Text="安裝位置："+destination;}}};
    var footer=new Label{Left=30,Top=430,Width=550,Height=20,ForeColor=Theme.Muted,Text="Windows x64  /  模型在本機運行  /  中斷後可繼續"};
    configure.CheckedChanged+=(s,e)=>button.Text=configure.Checked?"安裝並開始使用":"只安裝程式";
    bool busy=false;
    form.FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
    button.Click+=async(s,e)=>{
      busy=true;button.Enabled=false;configure.Enabled=false;browse.Enabled=false;progress.Visible=true;
      string stage=Path.Combine(Path.GetTempPath(),"DailyAgent-Setup-"+Guid.NewGuid().ToString("N"));
      try{
        var drive=new DriveInfo(Path.GetPathRoot(destination));
        string manifests=Path.Combine(destination,"runtime","models","manifests","registry.ollama.ai","library");
        bool hasBasic=File.Exists(Path.Combine(destination,"runtime","ollama","ollama.exe"))&&File.Exists(Path.Combine(manifests,"qwen3.5","4b"))&&File.Exists(Path.Combine(manifests,"embeddinggemma","latest"))&&File.Exists(Path.Combine(manifests,"daily-qwen-idle","0.8b-q4"));
        if(drive.AvailableFreeSpace<(configure.Checked&&!hasBasic?12L:1L)*1024*1024*1024)throw new Exception("這個磁碟剩餘空間不足，請按「變更安裝位置」選擇其他磁碟。");
        label.Text="正在校驗並安裝程式…\n\n完成後將開啟設定視窗，顯示模型下載進度。\n\n如果下載中斷或重開機，開啟桌面\n「Daily Agent 功能與設定」即可重試。";
        await Task.Run(()=>Install(stage,destination));
        if(configure.Checked)Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \""+Path.Combine(destination,"Setup-DailyAgent.ps1")+"\" -AutoSetup"){UseShellExecute=true,WorkingDirectory=destination});
        else MessageBox.Show("安裝完成。要下載模型時，開啟桌面「Daily Agent 功能與設定」。","日常桌寵");
        busy=false;form.Close();
      }catch(Exception error){MessageBox.Show("安裝未完成：\n"+error.Message+"\n\n請重試；既有個人資料會保留。","日常桌寵安裝",MessageBoxButtons.OK,MessageBoxIcon.Error);}
      finally{busy=false;button.Enabled=true;configure.Enabled=true;browse.Enabled=true;progress.Visible=false;try{Directory.Delete(stage,true);}catch{}}
    };
    form.Controls.AddRange(new Control[]{brand,subtitle,card,configure,progress,button,browse,footer});
    if(args.Length==2&&args[0]=="--ui-test") {
      // Render the actual window without installing or executing the embedded payload.
      form.Show();Application.DoEvents();
      using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(0,0,form.Width,form.Height));bitmap.Save(Path.GetFullPath(args[1]));}
      form.Close();form.Dispose();return 0;
    }
    Application.Run(form);return 0;
  }
}
