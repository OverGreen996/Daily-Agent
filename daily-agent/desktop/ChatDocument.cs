using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
namespace DailyPet {
  sealed class ChatDocument : IDisposable {
    public string Name,Base64;
    public long Bytes;
    public Bitmap Preview;
    public static bool Supported(string file) {string ext=Path.GetExtension(file).ToLowerInvariant();return ext==".txt" || ext==".md" || ext==".pdf" || ext==".ics";}
    public static ChatDocument FromFile(string file) {
      if(!Supported(file))throw new Exception("目前支援 TXT、Markdown、PDF 和 ICS 行事曆。");
      long size=new FileInfo(file).Length;
      if(size<1 || size>5*1024*1024)throw new Exception("文件必須介於 1 byte 與 5 MB。");
      byte[] bytes=File.ReadAllBytes(file);
      if(bytes.Length>5*1024*1024)throw new Exception("文件超過 5 MB。");
      var preview=new Bitmap(80,58,PixelFormat.Format32bppPArgb);
      using(var g=Graphics.FromImage(preview))using(var pen=new Pen(Color.FromArgb(104,145,136),2))using(var font=Bubble.TextFont(10))using(var ink=new SolidBrush(Color.FromArgb(38,43,42))) {
        g.Clear(Color.Transparent);g.DrawRectangle(pen,20,3,40,50);g.DrawString(Path.GetExtension(file).TrimStart('.').ToUpperInvariant(),font,ink,23,20);
      }
      return new ChatDocument {Name=Path.GetFileName(file),Base64=Convert.ToBase64String(bytes),Bytes=bytes.Length,Preview=preview};
    }
    public void Dispose(){if(Preview!=null){Preview.Dispose();Preview=null;}Base64=null;}
  }
}
