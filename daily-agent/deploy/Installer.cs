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
      if(MessageBox.Show("將日常桌寵安裝至：\n"+destination+"\n\n安裝完成可一鍵下載模型並配置本地環境。","日常桌寵安裝",MessageBoxButtons.OKCancel)!=DialogResult.OK)return 0;
      string stage=Path.Combine(Path.GetTempPath(),"DailyAgent-Setup-"+Guid.NewGuid().ToString("N"));
      using(var archive=ZipFile.OpenRead(zip))foreach(var e in archive.Entries) {
        if(!Path.GetFullPath(Path.Combine(stage,e.FullName)).StartsWith(stage+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Unsafe ZIP entry");
      }
      ZipFile.ExtractToDirectory(zip,stage);
      var start=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(stage,"Install-DailyAgent.ps1")+"\" -Destination \""+destination+"\"");
      start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardError=true;
      using(var p=Process.Start(start)){string error=p.StandardError.ReadToEnd();p.WaitForExit();if(p.ExitCode!=0)throw new Exception(error);}
      var setupNow=MessageBox.Show("安裝完成。現在一鍵配置完整本地環境嗎？\n\n自動下載聊天、記憶、語音、生圖模型、瀏覽器、搜尋與手機連線工具。全新安裝請預留約 60 GB SSD 空間。已有資源會沿用，失敗可重跑。\n\nWindows 可能要求管理員授權或重開機；Cloudflare 帳號與網域由你自己設定。\n選「否」可稍後雙擊桌面的 Daily Agent Setup 捷徑。", "Daily Agent 一鍵完整配置",MessageBoxButtons.YesNo,MessageBoxIcon.Question);
      if(setupNow==DialogResult.Yes) {
        Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -NoExit -ExecutionPolicy Bypass -File \""+Path.Combine(destination,"Setup-DailyAgent.ps1")+"\""){UseShellExecute=true,WorkingDirectory=destination});
      } else Process.Start("explorer.exe",destination);
      return 0;
    }catch(Exception e){MessageBox.Show(e.Message,"Daily Agent Setup failed",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
  }
}
