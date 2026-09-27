using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Windows.Forms;
class Installer {
  [STAThread] static int Main(string[] args) {
    Application.EnableVisualStyles();
    try {
      string root=AppDomain.CurrentDomain.BaseDirectory;
      string zip=Path.Combine(root,"DailyAgent-Windows.zip");
      string expected=File.ReadAllText(Path.Combine(root,"DailyAgent-Windows.zip.sha256")).Trim().Split(' ')[0];
      using(var h=SHA256.Create())using(var s=File.OpenRead(zip)) {
        if(!String.Equals(BitConverter.ToString(h.ComputeHash(s)).Replace("-",""),expected,StringComparison.OrdinalIgnoreCase)) throw new Exception("Package checksum mismatch.");
      }
      string destination=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"DailyAgent");
      if(MessageBox.Show("Install Daily Agent to:\n"+destination+"\n\nModels are downloaded separately during first-time setup.","Daily Agent Setup",MessageBoxButtons.OKCancel)!=DialogResult.OK)return 0;
      string stage=Path.Combine(Path.GetTempPath(),"DailyAgent-Setup-"+Guid.NewGuid().ToString("N"));
      using(var archive=ZipFile.OpenRead(zip))foreach(var e in archive.Entries) {
        if(!Path.GetFullPath(Path.Combine(stage,e.FullName)).StartsWith(stage+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Unsafe ZIP entry");
      }
      ZipFile.ExtractToDirectory(zip,stage);
      var start=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(stage,"Install-DailyAgent.ps1")+"\" -Destination \""+destination+"\"");
      start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardError=true;
      using(var p=Process.Start(start)){string error=p.StandardError.ReadToEnd();p.WaitForExit();if(p.ExitCode!=0)throw new Exception(error);}
      var setupNow=MessageBox.Show("安裝完成。現在下載基本模型與語音資源嗎？\n\n需要網路、數 GB 以上磁碟空間，可能花一些時間。\n本安裝目錄已有的資源會沿用；不包含選用生圖模型。\n\n選「否」可稍後執行安裝資料夾的 Setup-DailyAgent.ps1。", "Daily Agent 初次設定",MessageBoxButtons.YesNo,MessageBoxIcon.Question);
      if(setupNow==DialogResult.Yes) {
        Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -NoExit -ExecutionPolicy Bypass -File \""+Path.Combine(destination,"Setup-DailyAgent.ps1")+"\""){UseShellExecute=true,WorkingDirectory=destination});
      } else Process.Start("explorer.exe",destination);
      return 0;
    }catch(Exception e){MessageBox.Show(e.Message,"Daily Agent Setup failed",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
  }
}
