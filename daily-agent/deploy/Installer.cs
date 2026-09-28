using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;
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
    var form=new Form{Text="日常桌寵：一鍵安裝",Width=610,Height=340,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false};
    var label=new Label{Left=24,Top=20,Width=550,Height=115,Text="只需這一個安裝檔，不用解壓縮或輸入指令。\n\n安裝位置："+destination+"\n\n安裝後勾選需要的功能，只下載所選模型。\n適用 Windows x64、NVIDIA 顯卡；目前配置以 12 GB 顯存為基準。"};
    var configure=new CheckBox{Left=24,Top=145,Width=550,Height=38,Checked=true,Text="安裝後開啟功能勾選視窗（基本功能預設勾選）"};
    var progress=new ProgressBar{Left=24,Top=200,Width=550,Height=22,Style=ProgressBarStyle.Marquee,Visible=false};
    var button=new Button{Left=385,Top=242,Width=190,Height=38,Text="安裝並選擇功能"};
    configure.CheckedChanged+=(s,e)=>button.Text=configure.Checked?"安裝並選擇功能":"只安裝程式";
    bool busy=false;
    form.FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
    button.Click+=async(s,e)=>{
      busy=true;button.Enabled=false;configure.Enabled=false;progress.Visible=true;
      string stage=Path.Combine(Path.GetTempPath(),"DailyAgent-Setup-"+Guid.NewGuid().ToString("N"));
      try{
        label.Text="正在校驗並安裝程式，請稍候…\n\n安裝後會先讓你勾選功能，再下載及配置。\n下載中斷或重開機後，雙擊桌面「Daily Agent Setup」即可繼續。\n\n手機配對與 Cloudflare 帳號會在後續自行設定。";
        await Task.Run(()=>Install(stage,destination));
        if(configure.Checked)Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -NoExit -ExecutionPolicy Bypass -File \""+Path.Combine(destination,"Setup-DailyAgent.ps1")+"\""){UseShellExecute=true,WorkingDirectory=destination});
        else MessageBox.Show("安裝完成。要下載模型時，雙擊桌面「Daily Agent Setup」。","日常桌寵");
        busy=false;form.Close();
      }catch(Exception error){MessageBox.Show("安裝未完成：\n"+error.Message+"\n\n請重試；既有個人資料會保留。","日常桌寵安裝",MessageBoxButtons.OK,MessageBoxIcon.Error);}
      finally{busy=false;button.Enabled=true;configure.Enabled=true;progress.Visible=false;try{Directory.Delete(stage,true);}catch{}}
    };
    form.Controls.AddRange(new Control[]{label,configure,progress,button});Application.Run(form);return 0;
  }
}
