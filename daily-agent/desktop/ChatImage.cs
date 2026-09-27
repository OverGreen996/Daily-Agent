using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace DailyPet {
  sealed class ChatImage : IDisposable {
    public Bitmap Preview;
    public string Base64, Name;
    public int Width, Height;
    public static bool Supported(string file) {
      string ext=Path.GetExtension(file).ToLowerInvariant();
      return ext==".png" || ext==".jpg" || ext==".jpeg" || ext==".webp" || ext==".bmp";
    }
    public static ChatImage FromFile(PetLibrary library,string file) {
      if(!Supported(file)) throw new Exception("請拖入 PNG、JPG、WebP 或 BMP 圖片。");
      using(var bitmap=library.ReadChatBitmap(file)) return Prepare(bitmap,Path.GetFileName(file));
    }
    public static ChatImage FromBase64(string encoded,string name) {
      byte[] bytes=Convert.FromBase64String(encoded);
      using(var stream=new MemoryStream(bytes)) using(var source=Image.FromStream(stream)) return Prepare(source,name);
    }
    public static ChatImage Prepare(Image source,string name) {
      if(source.Width<1 || source.Height<1 || source.Width>8192 || source.Height>8192 || (long)source.Width*source.Height>16777216) throw new Exception("圖片最多 8192 邊長及 1600 萬像素。");
      double scale=Math.Min(1,2048.0/Math.Max(source.Width,source.Height));
      int w=Math.Max(1,(int)(source.Width*scale)),h=Math.Max(1,(int)(source.Height*scale));
      using(var image=new Bitmap(w,h,PixelFormat.Format24bppRgb)) {
        using(var g=Graphics.FromImage(image)) { g.Clear(Color.White); g.InterpolationMode=InterpolationMode.HighQualityBicubic; g.DrawImage(source,0,0,w,h); }
        byte[] bytes;
        using(var stream=new MemoryStream()) { image.Save(stream,ImageFormat.Png); bytes=stream.ToArray(); }
        if(bytes.Length>5500000) {
          ImageCodecInfo jpeg=null;
          foreach(var codec in ImageCodecInfo.GetImageEncoders()) if(codec.FormatID==ImageFormat.Jpeg.Guid) jpeg=codec;
          using(var options=new EncoderParameters(1)) using(var stream=new MemoryStream()) {
            options.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,90L); image.Save(stream,jpeg,options); bytes=stream.ToArray();
          }
        }
        if(bytes.Length>5500000) throw new Exception("圖片仍然太大，請先縮小後再試。");
        var thumbnail=new Bitmap(80,58,PixelFormat.Format32bppPArgb);
        using(var g=Graphics.FromImage(thumbnail)) {
          g.Clear(Color.Transparent); g.InterpolationMode=InterpolationMode.HighQualityBicubic;
          double ratio=Math.Min(80.0/w,58.0/h); int tw=Math.Max(1,(int)(w*ratio)),th=Math.Max(1,(int)(h*ratio));
          g.DrawImage(image,(80-tw)/2,(58-th)/2,tw,th);
        }
        return new ChatImage {Preview=thumbnail,Base64=Convert.ToBase64String(bytes),Name=name,Width=w,Height=h};
      }
    }
    public void Dispose() { if(Preview!=null) {Preview.Dispose();Preview=null;} Base64=null; }
  }
  sealed class ChatInput : TextBox {
    public Func<IDataObject,bool> PasteData;
    public Action<Exception> PasteError;
    protected override void WndProc(ref Message m) {
      // Read clipboard only in direct response to the user's Paste command.
      if(m.Msg==0x302 && PasteData!=null) {
        try { if(PasteData(Clipboard.GetDataObject())) return; }
        catch(Exception e) { if(PasteError!=null) PasteError(e); return; }
      }
      base.WndProc(ref m);
    }
  }
}
