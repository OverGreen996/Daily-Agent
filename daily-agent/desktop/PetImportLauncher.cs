using System;
using System.IO;
using System.Reflection;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

// Public entry point: double-click; never compile or fall back to a source library.
static class PetImportLauncher {
  static Dictionary<string,object> Read(string path){return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(path));}
  static string Value(Dictionary<string,object> data,string key){object v;return data!=null&&data.TryGetValue(key,out v)?Convert.ToString(v):"";}
  static string Hash(string path){using(var h=SHA256.Create())using(var s=File.OpenRead(path))return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
  static string InstalledRoot(string install){
    install=Path.GetFullPath(install).TrimEnd(Path.DirectorySeparatorChar);
    if(!File.Exists(Path.Combine(install,"current.json")))throw new Exception("請先安裝 Daily Agent，再開啟 PET 快速匯入工具。\n安裝下載：https://github.com/OverGreen996/Daily-Agent/releases/latest");
    var marker=Read(Path.Combine(install,".daily-install.json"));
    if(Value(marker,"kind")!="DailyAgentInstallation"||!String.Equals(Path.GetFullPath(Value(marker,"root")).TrimEnd(Path.DirectorySeparatorChar),install,StringComparison.OrdinalIgnoreCase))throw new Exception("Daily Agent 安裝標記不正確，請修復安裝後再試。");
    var state=Read(Path.Combine(install,"current.json"));string version=Value(state,"current");
    if(Value(state,"dataFormat")!="1"||!Regex.IsMatch(version,"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$"))throw new Exception("Daily Agent 版本資訊不正確，請修復安裝後再試。");
    string root=Path.Combine(install,"releases",version);
    if(!File.Exists(Path.Combine(root,"daily-agent","desktop","assets","lumi","pet.json")))throw new Exception("Daily Agent 安裝版本不完整，請先修復安裝。");
    return root;
  }
  [STAThread] static int Main(string[] args){
    try{
      string install=Convert.ToString(Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyAgent","InstallLocation",null));
      if(String.IsNullOrWhiteSpace(install))install=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"DailyAgent");
      bool verify=args.Length>1&&args[0]=="--verify-target";
      if(verify&&args.Length>2)install=args[2];
      string root=InstalledRoot(install),baseDir=AppDomain.CurrentDomain.BaseDirectory;
      string executable=Path.Combine(baseDir,"tool","DailyPet.exe");
      var manifest=Read(Path.Combine(baseDir,"tool","manifest.json"));
      if(Hash(executable)!=Value(manifest,"sha256"))throw new Exception("工具檔案校驗失敗，請重新下載並完整解壓。");
      if(verify){File.WriteAllText(args[1],new JavaScriptSerializer().Serialize(new{passed=true,projectRoot=root,library=Path.Combine(install,"runtime","native-pet","pets"),binaryVerified=true}));return 0;}
      string node=Path.Combine(root,"vendor","node");if(File.Exists(Path.Combine(node,"node.exe")))Environment.SetEnvironmentVariable("PATH",node+";"+Environment.GetEnvironmentVariable("PATH"));
      var call=new List<string>{root,"http://127.0.0.1:3210","--pet-quick-import"};if(args.Length==1)call.Add(Path.GetFullPath(args[0]));
      var assembly=Assembly.LoadFrom(executable);var program=assembly.GetType("DailyPet.Program",true);
      return Convert.ToInt32(program.GetMethod("Main",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{call.ToArray()}));
    }catch(Exception e){
      Exception error=e.GetBaseException();
      if(args.Length>1&&args[0]=="--verify-target"){File.WriteAllText(args[1],new JavaScriptSerializer().Serialize(new{passed=false,error=error.Message}));return 1;}
      MessageBox.Show(error.Message,"PET 快速匯入",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;
    }
  }
}
