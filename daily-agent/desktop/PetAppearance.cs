using System;
using System.IO;
using System.IO.Compression;
using System.Drawing;
using System.Drawing.Imaging;
using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace DailyPet {
  sealed class PetAppearance : IDisposable {
    public string Id, Name;
    public bool Animated;
    public int NeutralColumn;
    public Bitmap Image;
    public int CellWidth { get { return Animated ? Image.Width/8 : Image.Width; } }
    public int CellHeight { get { return Animated ? Image.Height/11 : Image.Height; } }
    public void Dispose() { if(Image!=null) { Image.Dispose(); Image=null; } }
  }
  sealed class PetLibrary {
    readonly string root, library;
    const int MaxFileBytes=32*1024*1024;
    public PetLibrary(string projectRoot,string testLibrary=null) {
      root=projectRoot; library=testLibrary ?? Path.Combine(root,".daily-runtime","native-pet","pets");
      Directory.CreateDirectory(library);
    }
    public static string NameFrom(Dictionary<string,object> metadata,string fallback) {
      string name=Json.Text(metadata,"chatName");
      if(String.IsNullOrWhiteSpace(name)) name=Json.Text(metadata,"displayName");
      name=Regex.Replace(name,"[\\x00-\\x1f]"," ").Trim();
      if(name.Length==0) name=fallback;
      return name.Length>64 ? name.Substring(0,64) : name;
    }
    string Folder(string id) {
      if(!Regex.IsMatch(id ?? "","^[a-f0-9]{32}$")) throw new Exception("無效的寵物資料代號。");
      return Path.Combine(library,id);
    }
    public List<KeyValuePair<string,string>> List() {
      var results=new List<KeyValuePair<string,string>>();
      foreach(string dir in Directory.GetDirectories(library)) {
        try {
          string id=Path.GetFileName(dir); Folder(id);
          var data=Json.Decode(File.ReadAllText(Path.Combine(dir,"profile.json")));
          if(File.Exists(Path.Combine(dir,"sprite.png"))) results.Add(new KeyValuePair<string,string>(id,NameFrom(data,"自訂寵物")));
        } catch { }
      }
      results.Sort((a,b)=>String.Compare(a.Value,b.Value,StringComparison.CurrentCulture));
      return results;
    }
    public PetAppearance Load(string id) {
      bool builtin=String.IsNullOrEmpty(id) || id=="lumi";
      string dir=builtin ? Path.Combine(root,"daily-agent","desktop","assets","lumi") : Folder(id);
      var meta=Json.Decode(File.ReadAllText(Path.Combine(dir,builtin ? "pet.json" : "profile.json")));
      bool animated=builtin || (meta.ContainsKey("animated") && Convert.ToBoolean(meta["animated"]));
      Bitmap image=ReadBitmap(Path.Combine(dir,builtin ? "spritesheet.png" : "sprite.png"));
      try {
        Validate(image,animated);
        int[] cells=animated?InspectCells(image):null;
        return new PetAppearance {Id=builtin ? "lumi" : id,Name=NameFrom(meta,"桌面夥伴"),Animated=animated,Image=image,NeutralColumn=animated&&cells[6]>0?6:0};
      } catch { image.Dispose(); throw; }
    }
    static Bitmap ReadBitmap(string file) {
      using(var source=System.Drawing.Image.FromFile(file)) {
        if(source.Width<1 || source.Height<1 || source.Width>8192 || source.Height>8192 || (long)source.Width*source.Height>16777216) throw new Exception("圖片過大，最多 8192 邊長及 1600 萬像素。");
        var copy=new Bitmap(source.Width,source.Height,PixelFormat.Format32bppPArgb);
        using(var g=Graphics.FromImage(copy)) { g.Clear(Color.Transparent); g.DrawImage(source,0,0,source.Width,source.Height); }
        return copy;
      }
    }
    public Bitmap ReadChatBitmap(string file) {
      var info=new FileInfo(file);
      if(!info.Exists || info.Length>MaxFileBytes) throw new Exception("圖片檔案最多 32 MB。");
      if(info.Extension.ToLowerInvariant()!=".webp") return ReadBitmap(file);
      string id=Guid.NewGuid().ToString("N"),dir=Folder(id);
      Directory.CreateDirectory(dir);
      try { string output=Path.Combine(dir,"decoded.png"); DecodeWebP(info.FullName,output); return ReadBitmap(output); }
      finally {
        string resolved=Path.GetFullPath(dir),expected=Path.GetFullPath(library)+Path.DirectorySeparatorChar;
        if(resolved.StartsWith(expected,StringComparison.OrdinalIgnoreCase) && Path.GetFileName(resolved)==id) { try { Directory.Delete(resolved,true); } catch {} }
      }
    }
    public static int[] InspectCells(Bitmap image){
      var counts=new int[88];int cw=image.Width/8,ch=image.Height/11;
      var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
      try{byte[] row=new byte[image.Width*4];for(int y=0;y<image.Height;y++){Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),row,0,row.Length);for(int x=0;x<image.Width;x++)if(row[x*4+3]>0)counts[(y/ch)*8+x/cw]++;}}finally{image.UnlockBits(data);}return counts;
    }
    public static void Validate(Bitmap image,bool animated,bool strict=false) {
      if(animated && (image.Width%8!=0 || image.Height%11!=0 || image.Width/8<16 || image.Height/11<16)) throw new Exception("v2 動畫包須為 8 欄 × 11 列精靈圖。");
      if(!strict)return;
      if(animated){
        if((long)(image.Width/8)*13!=(long)(image.Height/11)*12)throw new Exception("v2 單格比例須為 192:208（12:13）；建議整圖 1536×2288。");
        int[] counts=InspectCells(image);int pixels=image.Width/8*(image.Height/11);
        for(int row=0;row<11;row++)for(int col=0;col<8;col++){
          int count=counts[row*8+col];bool required=col<PetAnimations.Counts[row],neutral=row==0&&col==6;
          if(required&&count==0)throw new Exception("動畫缺少 "+PetAnimations.Names[row]+" 的第 "+(col+1)+" 格。");
          if(!required&&!neutral&&count>0)throw new Exception("第 "+(row+1)+" 列第 "+(col+1)+" 格是保留格，須完全透明。");
          if((required||neutral)&&count>pixels*.95)throw new Exception("動畫格缺少足夠透明背景，請提供真正去背的 PNG／WebP。");
        }
      }else{
        bool visible=false,transparent=false;
        var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppPArgb);
        try{byte[] row=new byte[image.Width*4];for(int y=0;y<image.Height&&!(visible&&transparent);y++){Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),row,0,row.Length);for(int x=0;x<image.Width;x++){if(row[x*4+3]==0)transparent=true;if(row[x*4+3]>0)visible=true;}}}finally{image.UnlockBits(data);}
        if(!visible||!transparent)throw new Exception("靜態寵物須有可見角色與真正透明背景；不接受空白圖、JPG 或整張不透明背景。");
      }
    }
    static byte[] ReadEntry(ZipArchiveEntry entry,int maxBytes) {
      if(entry.Length<1 || entry.Length>maxBytes) throw new Exception("動畫包內容超過大小限制。");
      using(var input=entry.Open()) using(var output=new MemoryStream()) {
        byte[] buffer=new byte[8192]; int n;
        while((n=input.Read(buffer,0,buffer.Length))>0) {
          if(output.Length+n>maxBytes) throw new Exception("解壓縮內容過大。");
          output.Write(buffer,0,n);
        }
        return output.ToArray();
      }
    }
    static string SafeEntryName(string name) {
      string s=name.Replace('\\','/');
      if(s.StartsWith("/") || s.Contains(":")) throw new Exception("動畫包含不安全的檔案路徑。");
      foreach(string segment in s.Split('/')) if(segment==".." || segment==".") throw new Exception("動畫包含不安全的檔案路徑。");
      return s;
    }
    public PetAppearance Import(string sourcePath) {
      var source=new FileInfo(sourcePath);
      if(!source.Exists || source.Length<1 || source.Length>64*1024*1024) throw new Exception("請選擇 64 MB 以內的寵物檔案。");
      string extension=source.Extension.ToLowerInvariant();
      if(extension!=".zip" && extension!=".png" && extension!=".webp") throw new Exception("寵物外觀支援去背 PNG、WebP 圖片或 v2 ZIP 動畫包。");
      string id=Guid.NewGuid().ToString("N"), dir=Folder(id);
      Directory.CreateDirectory(dir);
      PetAppearance result=null;
      try {
        string name=Path.GetFileNameWithoutExtension(source.Name); bool animated=extension==".zip";
        byte[] bytes;
        if(animated) {
          using(var zip=ZipFile.OpenRead(source.FullName)) {
            if(zip.Entries.Count>2000) throw new Exception("動畫包包含過多檔案。");
            ZipArchiveEntry manifest=null;
            foreach(var entry in zip.Entries) {
              string entryName=SafeEntryName(entry.FullName);
              if(entryName.StartsWith("__MACOSX/")) continue;
              if(entryName=="pet.json" || entryName.EndsWith("/pet.json")) {
                if(manifest!=null) throw new Exception("一次只能匯入一隻寵物，請使用只含一個 pet.json 的包。");
                manifest=entry;
              }
            }
            if(manifest==null) throw new Exception("找不到 pet.json；請使用 v2 寵物動畫包。");
            var meta=Json.Decode(System.Text.Encoding.UTF8.GetString(ReadEntry(manifest,65536)).TrimStart('\uFEFF'));
            if(!meta.ContainsKey("spriteVersionNumber") || Convert.ToInt32(meta["spriteVersionNumber"])!=2) throw new Exception("目前只支援 spriteVersionNumber 2 動畫包。");
            string manifestPath=SafeEntryName(manifest.FullName);
            string prefix=manifestPath.Substring(0,manifestPath.LastIndexOf('/')+1);
            string spriteName=SafeEntryName(Json.Text(meta,"spritesheetPath"));
            if(String.IsNullOrWhiteSpace(spriteName)) throw new Exception("pet.json 缺少 spritesheetPath。");
            var sprite=zip.GetEntry(prefix+spriteName);
            if(sprite==null) throw new Exception("動畫包缺少精靈圖。");
            extension=Path.GetExtension(spriteName).ToLowerInvariant();
            if(extension!=".png" && extension!=".webp") throw new Exception("動畫精靈圖須為 PNG 或 WebP。");
            bytes=ReadEntry(sprite,MaxFileBytes); name=NameFrom(meta,name);
          }
        } else {
          if(source.Length>MaxFileBytes) throw new Exception("圖片檔案最多 32 MB。");
          bytes=File.ReadAllBytes(source.FullName);
        }
        string input=Path.Combine(dir,"source"+extension), output=Path.Combine(dir,"sprite.png");
        File.WriteAllBytes(input,bytes);
        if(extension==".webp") DecodeWebP(input,output);
        else using(var image=ReadBitmap(input)) image.Save(output,ImageFormat.Png);
        using(var image=ReadBitmap(output)) Validate(image,animated,true);
        name=NameFrom(new Dictionary<string,object>{{"displayName",name}},"自訂寵物");
        File.WriteAllText(Path.Combine(dir,"profile.json"),Json.Encode(new { displayName=name,animated=animated,formatVersion=2,validation="daily-pet-v2-structure-1" }));
        result=Load(id); return result;
      } catch {
        if(result!=null) result.Dispose();
        // Only this newly allocated, verified library child may be cleaned up.
        string resolved=Path.GetFullPath(dir), expected=Path.GetFullPath(library)+Path.DirectorySeparatorChar;
        if(resolved.StartsWith(expected,StringComparison.OrdinalIgnoreCase) && Path.GetFileName(resolved)==id) {
          try { Directory.Delete(resolved,true); } catch { }
        }
        throw;
      }
    }
    static string QuoteFile(string path) {
      if(path.Contains("\"") || path.Contains("\n") || path.EndsWith("\\")) throw new Exception("不支援的檔案路徑。");
      return "\""+path+"\"";
    }
    void DecodeWebP(string input,string output) {
      string script=Path.Combine(root,"daily-agent","desktop","decode-pet.mjs");
      var start=new ProcessStartInfo("node.exe",QuoteFile(script)+" "+QuoteFile(input)+" "+QuoteFile(output)) {
        UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardError=true,RedirectStandardOutput=true
      };
      using(var process=Process.Start(start)) {
        var errors=process.StandardError.ReadToEndAsync(); var log=process.StandardOutput.ReadToEndAsync();
        if(!process.WaitForExit(45000)) { process.Kill(); throw new Exception("圖片解碼逾時，請改用 PNG 再試。"); }
        if(process.ExitCode!=0) throw new Exception("無法解碼 WebP 圖片，請確認圖片有效，或改用 PNG。");
        System.Threading.Tasks.Task.WaitAll(errors,log);
      }
    }
  }
}
