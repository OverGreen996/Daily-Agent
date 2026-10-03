using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Windows.Forms;
class XngSetup {
 static void Extract(string target) {
  if(Directory.Exists(target))throw new Exception("解壓目錄已存在");
  Directory.CreateDirectory(target);
  using(var source=Assembly.GetExecutingAssembly().GetManifestResourceStream("XNG.Setup"))
  using(var zip=new ZipArchive(source,ZipArchiveMode.Read)) {
   foreach(var entry in zip.Entries){
    string file=Path.GetFullPath(Path.Combine(target,entry.FullName));
    if(!file.StartsWith(target+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||entry.FullName.Contains(":"))throw new Exception("安裝包路徑不安全");
    Directory.CreateDirectory(Path.GetDirectoryName(file));
    if(!entry.FullName.EndsWith("/"))entry.ExtractToFile(file);
   }
  }
 }
 [STAThread] static int Main(string[] args) {
  try {
   if(args.Length==2&&args[0]=="--extract-only"){Extract(Path.GetFullPath(args[1]));return 0;}
   if(!Environment.Is64BitOperatingSystem)throw new Exception("此版本需要 Windows 64 位元。");
   string target=Path.Combine(Path.GetTempPath(),"XNG-Setup-"+Guid.NewGuid().ToString("N"));
   Extract(target);
   var start=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(target,"Launch-Setup.ps1")+"\"");
   start.UseShellExecute=false;start.CreateNoWindow=true;
   using(var process=Process.Start(start)){process.WaitForExit();return process.ExitCode;}
  }catch(Exception e){MessageBox.Show(e.Message,"XNG 一鍵套用");return 1;}
 }
}
