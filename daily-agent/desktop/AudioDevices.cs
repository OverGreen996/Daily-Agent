using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

namespace DailyPet {
  sealed class AudioDevice {
    public string Id,Name;
    public int Index;
    public AudioDevice(string id,string name,int index){Id=id;Name=name;Index=index;}
  }
  static class AudioDevices {
    public static object Call(object obj,string name,params object[] args){return obj.GetType().InvokeMember(name,BindingFlags.InvokeMethod,null,obj,args);}
    public static object Get(object obj,string name){return obj.GetType().InvokeMember(name,BindingFlags.GetProperty,null,obj,null);}
    public static void Set(object obj,string name,object value){obj.GetType().InvokeMember(name,BindingFlags.SetProperty,null,obj,new object[]{value});}
    public static void Release(object obj){if(obj!=null&&Marshal.IsComObject(obj))Marshal.ReleaseComObject(obj);}
    public static object NewSpeaker(){return Activator.CreateInstance(Type.GetTypeFromProgID("SAPI.SpVoice",true));}
    public static object OpenWave(string path){object stream=Activator.CreateInstance(Type.GetTypeFromProgID("SAPI.SpFileStream",true));try{Call(stream,"Open",path,0,false);return stream;}catch{Release(stream);throw;}}
    public static void CloseWave(object stream){if(stream==null)return;try{Call(stream,"Close");}catch{}Release(stream);}
    public static List<AudioDevice> Outputs(){return Tokens("GetAudioOutputs");}
    public static List<AudioDevice> Voices(){return Tokens("GetVoices");}
    static List<AudioDevice> Tokens(string method){
      object speaker=null,tokens=null;var result=new List<AudioDevice>();
      try{speaker=NewSpeaker();tokens=Call(speaker,method,"","");
        for(int i=0;i<Convert.ToInt32(Get(tokens,"Count"));i++){object token=Call(tokens,"Item",i);try{result.Add(new AudioDevice(Convert.ToString(Get(token,"Id")),Convert.ToString(Call(token,"GetDescription",0)),i));}finally{Release(token);}}
        return result;
      }finally{Release(tokens);Release(speaker);}
    }
    public static void SelectOutput(object speaker,string id){
      if(String.IsNullOrEmpty(id))return;object tokens=null;
      try{tokens=Call(speaker,"GetAudioOutputs","","");for(int i=0;i<Convert.ToInt32(Get(tokens,"Count"));i++){object token=Call(tokens,"Item",i);try{if(String.Equals(Convert.ToString(Get(token,"Id")),id,StringComparison.OrdinalIgnoreCase)){Set(speaker,"AudioOutput",token);return;}}finally{Release(token);}}}
      finally{Release(tokens);}throw new InvalidOperationException("選定的播放裝置未連接，請在設定重新選擇。");
    }
    public static void SelectVoice(object speaker,string id){
      object tokens=null;
      try{tokens=Call(speaker,"GetVoices",String.IsNullOrEmpty(id)?"Language=404":"","");
        for(int i=0;i<Convert.ToInt32(Get(tokens,"Count"));i++){object token=Call(tokens,"Item",i);try{if(String.IsNullOrEmpty(id)||String.Equals(Convert.ToString(Get(token,"Id")),id,StringComparison.OrdinalIgnoreCase)){Set(speaker,"Voice",token);return;}}finally{Release(token);}}
      }finally{Release(tokens);}if(!String.IsNullOrEmpty(id))throw new InvalidOperationException("選定的 TTS 聲線已無法使用，請重新選擇。");
    }
    public static List<AudioDevice> Inputs(){
      var result=new List<AudioDevice>();for(int i=0;i<WaveInput.waveInGetNumDevs();i++){
        WaveInput.Caps caps;WaveInput.Check(WaveInput.waveInGetDevCaps(new UIntPtr((uint)i),out caps,(uint)Marshal.SizeOf(typeof(WaveInput.Caps))));
        string id=InputId(i);if(id.Length==0)continue; // Never persist an unstable numeric device index.
        result.Add(new AudioDevice(id,caps.Name,i));
      }return result;
    }
    static string InputId(int index){
      IntPtr size=Marshal.AllocHGlobal(4),buffer=IntPtr.Zero;
      try{Marshal.WriteInt32(size,0);if(WaveInput.waveInMessage(new IntPtr(index),0x80d,size,IntPtr.Zero)!=0)return "";int bytes=Marshal.ReadInt32(size);if(bytes<2||bytes>65536)return "";
        buffer=Marshal.AllocHGlobal(bytes);if(WaveInput.waveInMessage(new IntPtr(index),0x80c,buffer,new IntPtr(bytes))!=0)return "";return Marshal.PtrToStringUni(buffer);
      }finally{Marshal.FreeHGlobal(size);if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);}
    }
    public static int InputIndex(string id){if(String.IsNullOrEmpty(id))return -1;var device=Inputs().FirstOrDefault(d=>String.Equals(d.Id,id,StringComparison.OrdinalIgnoreCase));if(device==null)throw new InvalidOperationException("選定的麥克風未連接，請在設定重新選擇。");return device.Index;}
  }

  // Plays Kokoro's PCM WAV directly through the selected Windows waveOut endpoint.
  sealed class WaveOutput : IDisposable {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Caps {public ushort Mid,Pid;public uint Version;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string Name;public uint Formats;public ushort Channels,Reserved;public uint Support;}
    [StructLayout(LayoutKind.Sequential,Pack=2)] struct Format {public ushort Tag,Channels;public uint Rate,BytesPerSecond;public ushort Align,Bits,Extra;}
    [StructLayout(LayoutKind.Sequential)] struct Header {public IntPtr Data;public uint Length,Recorded;public IntPtr User;public uint Flags,Loops;public IntPtr Next,Reserved;}
    [StructLayout(LayoutKind.Sequential)] struct Time {public uint Type,Value,Reserved;}
    [DllImport("winmm.dll")] static extern uint waveOutGetNumDevs();
    [DllImport("winmm.dll",CharSet=CharSet.Unicode,EntryPoint="waveOutGetDevCapsW")] static extern uint waveOutGetDevCaps(UIntPtr device,out Caps caps,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutOpen(out IntPtr handle,uint device,ref Format format,IntPtr callback,IntPtr instance,uint flags);
    [DllImport("winmm.dll")] static extern uint waveOutPrepareHeader(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutWrite(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutGetPosition(IntPtr handle,ref Time time,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutReset(IntPtr handle);
    [DllImport("winmm.dll")] static extern uint waveOutUnprepareHeader(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutClose(IntPtr handle);
    IntPtr handle,header,data;readonly uint headerSize=(uint)Marshal.SizeOf(typeof(Header));uint dataLength,bytesPerSecond,blockAlign;bool disposed;
    static void Check(uint code){if(code!=0)throw new IOException("Windows 語音播放裝置錯誤："+code);}
    internal static uint Device(string id){if(String.IsNullOrEmpty(id))return UInt32.MaxValue;var selected=AudioDevices.Outputs().FirstOrDefault(x=>String.Equals(x.Id,id,StringComparison.OrdinalIgnoreCase));if(selected==null)throw new InvalidOperationException("選定的播放裝置未連接，請在設定重新選擇。");for(uint i=0;i<waveOutGetNumDevs();i++){Caps cap;Check(waveOutGetDevCaps(new UIntPtr(i),out cap,(uint)Marshal.SizeOf(typeof(Caps))));if(String.Equals(cap.Name,selected.Name,StringComparison.OrdinalIgnoreCase)||selected.Name.StartsWith(cap.Name,StringComparison.OrdinalIgnoreCase)||cap.Name.StartsWith(selected.Name,StringComparison.OrdinalIgnoreCase))return i;}throw new InvalidOperationException("選定的播放裝置不支援 WAV 直接播放："+selected.Name);}
    public WaveOutput(string path,string outputId){
      try{byte[] pcm=null;Format format=new Format();using(var file=File.OpenRead(path))using(var reader=new BinaryReader(file)){if(new string(reader.ReadChars(4))!="RIFF"){throw new InvalidDataException("Kokoro WAV 格式錯誤。");}reader.ReadUInt32();if(new string(reader.ReadChars(4))!="WAVE")throw new InvalidDataException("Kokoro WAV 格式錯誤。");while(file.Position+8<=file.Length){string chunk=new string(reader.ReadChars(4));uint length=reader.ReadUInt32();long end=file.Position+length;if(end>file.Length)throw new InvalidDataException("Kokoro WAV 已截斷。");if(chunk=="fmt "){format.Tag=reader.ReadUInt16();format.Channels=reader.ReadUInt16();format.Rate=reader.ReadUInt32();format.BytesPerSecond=reader.ReadUInt32();format.Align=reader.ReadUInt16();format.Bits=reader.ReadUInt16();format.Extra=0;}else if(chunk=="data")pcm=reader.ReadBytes((int)length);file.Position=end+(length%2);} }
        if(format.Tag!=1||format.Channels==0||format.Rate==0||format.Bits!=16||pcm==null||pcm.Length==0)throw new InvalidDataException("Kokoro WAV 必須是 16-bit PCM。");dataLength=(uint)pcm.Length;bytesPerSecond=format.BytesPerSecond;blockAlign=format.Align;Check(waveOutOpen(out handle,Device(outputId),ref format,IntPtr.Zero,IntPtr.Zero,0));data=Marshal.AllocHGlobal(pcm.Length);Marshal.Copy(pcm,0,data,pcm.Length);header=Marshal.AllocHGlobal((int)headerSize);Marshal.StructureToPtr(new Header{Data=data,Length=(uint)pcm.Length},header,false);Check(waveOutPrepareHeader(handle,header,headerSize));Check(waveOutWrite(handle,header,headerSize));
      }catch{Dispose();throw;}
    }
    public bool Done{get{if(disposed||header==IntPtr.Zero)return true;var state=(Header)Marshal.PtrToStructure(header,typeof(Header));if((state.Flags&1)!=0)return true;var position=new Time{Type=4};if(waveOutGetPosition(handle,ref position,(uint)Marshal.SizeOf(typeof(Time)))!=0)return false;if(position.Type==4)return position.Value>=dataLength;if(position.Type==2)return blockAlign>0&&position.Value>=dataLength/blockAlign;if(position.Type==1)return bytesPerSecond>0&&(ulong)position.Value+50>=((ulong)dataLength*1000)/bytesPerSecond;return false;}}
    public string Status{get{if(header==IntPtr.Zero)return "closed";var state=(Header)Marshal.PtrToStructure(header,typeof(Header));var position=new Time{Type=4};uint code=waveOutGetPosition(handle,ref position,(uint)Marshal.SizeOf(typeof(Time)));return "flags="+state.Flags+", type="+position.Type+", value="+position.Value+", bytes="+dataLength+", code="+code;}}
    public void Dispose(){if(disposed)return;disposed=true;if(handle!=IntPtr.Zero){waveOutReset(handle);if(header!=IntPtr.Zero)waveOutUnprepareHeader(handle,header,headerSize);waveOutClose(handle);handle=IntPtr.Zero;}if(header!=IntPtr.Zero){Marshal.FreeHGlobal(header);header=IntPtr.Zero;}if(data!=IntPtr.Zero){Marshal.FreeHGlobal(data);data=IntPtr.Zero;}}
  }

  sealed class StreamingWaveOutput : IDisposable {
    [StructLayout(LayoutKind.Sequential,Pack=2)] struct Format {public ushort Tag,Channels;public uint Rate,BytesPerSecond;public ushort Align,Bits,Extra;}
    [StructLayout(LayoutKind.Sequential)] struct Header {public IntPtr Data;public uint Length,Recorded;public IntPtr User;public uint Flags,Loops;public IntPtr Next,Reserved;}
    [DllImport("winmm.dll")] static extern uint waveOutOpen(out IntPtr handle,uint device,ref Format format,IntPtr callback,IntPtr instance,uint flags);
    [DllImport("winmm.dll")] static extern uint waveOutPrepareHeader(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutWrite(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutReset(IntPtr handle);
    [DllImport("winmm.dll")] static extern uint waveOutUnprepareHeader(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveOutClose(IntPtr handle);
    sealed class Buffer {public IntPtr Header,Data;}
    readonly object gate=new object();readonly List<Buffer> buffers=new List<Buffer>();readonly uint headerSize=(uint)Marshal.SizeOf(typeof(Header));IntPtr handle;bool complete,disposed;
    static void Check(uint code){if(code!=0)throw new IOException("Windows 串流語音播放錯誤："+code);}
    public StreamingWaveOutput(string outputId){var format=new Format{Tag=1,Channels=1,Rate=24000,BytesPerSecond=48000,Align=2,Bits=16};Check(waveOutOpen(out handle,WaveOutput.Device(outputId),ref format,IntPtr.Zero,IntPtr.Zero,0));}
    void Write(byte[] pcm){var b=new Buffer{Data=Marshal.AllocHGlobal(pcm.Length),Header=Marshal.AllocHGlobal((int)headerSize)};try{Marshal.Copy(pcm,0,b.Data,pcm.Length);Marshal.StructureToPtr(new Header{Data=b.Data,Length=(uint)pcm.Length},b.Header,false);Check(waveOutPrepareHeader(handle,b.Header,headerSize));buffers.Add(b);Check(waveOutWrite(handle,b.Header,headerSize));}catch{if(!buffers.Contains(b)){Marshal.FreeHGlobal(b.Header);Marshal.FreeHGlobal(b.Data);}throw;}}
    public void Add(byte[] pcm){if(pcm==null||pcm.Length<2)return;lock(gate){if(disposed)return;if(buffers.Count==0)Write(new byte[14400]);Write(pcm);}}
    public void Complete(){lock(gate)complete=true;}
    public bool HasAudio{get{lock(gate)return buffers.Count>0;}}
    public bool Done{get{lock(gate){if(disposed)return true;if(!complete||buffers.Count==0)return false;return buffers.All(b=>(((Header)Marshal.PtrToStructure(b.Header,typeof(Header))).Flags&1)!=0);}}}
    public void Dispose(){lock(gate){if(disposed)return;disposed=true;if(handle!=IntPtr.Zero)waveOutReset(handle);foreach(var b in buffers){if(handle!=IntPtr.Zero)waveOutUnprepareHeader(handle,b.Header,headerSize);Marshal.FreeHGlobal(b.Header);Marshal.FreeHGlobal(b.Data);}buffers.Clear();if(handle!=IntPtr.Zero){waveOutClose(handle);handle=IntPtr.Zero;}}}
  }

  // Bounded live PCM stream for System.Speech; audio stays in RAM and is discarded on stop.
  sealed class WaveInput : Stream {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct Caps {public ushort Mid,Pid;public uint Version;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string Name;public uint Formats;public ushort Channels,Reserved;}
    [StructLayout(LayoutKind.Sequential,Pack=2)] struct Format {public ushort Tag,Channels;public uint Rate,Bytes;public ushort Align,Bits,Extra;}
    [StructLayout(LayoutKind.Sequential)] struct Header {public IntPtr Data;public uint Length,Recorded;public IntPtr User;public uint Flags,Loops;public IntPtr Next,Reserved;}
    [DllImport("winmm.dll")] internal static extern uint waveInGetNumDevs();
    [DllImport("winmm.dll",CharSet=CharSet.Unicode,EntryPoint="waveInGetDevCapsW")] internal static extern uint waveInGetDevCaps(UIntPtr device,out Caps caps,uint size);
    [DllImport("winmm.dll")] internal static extern uint waveInMessage(IntPtr device,uint message,IntPtr p1,IntPtr p2);
    [DllImport("winmm.dll")] static extern uint waveInOpen(out IntPtr handle,uint device,ref Format format,IntPtr callback,IntPtr instance,uint flags);
    [DllImport("winmm.dll")] static extern uint waveInPrepareHeader(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveInUnprepareHeader(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveInAddBuffer(IntPtr handle,IntPtr header,uint size);
    [DllImport("winmm.dll")] static extern uint waveInStart(IntPtr handle);
    [DllImport("winmm.dll")] static extern uint waveInReset(IntPtr handle);
    [DllImport("winmm.dll")] static extern uint waveInClose(IntPtr handle);
    internal static void Check(uint code){if(code!=0)throw new IOException("Windows 音訊裝置錯誤："+code);}
    readonly object gate=new object();readonly Queue<byte[]> pending=new Queue<byte[]>();readonly List<IntPtr> headers=new List<IntPtr>();
    readonly AutoResetEvent signal=new AutoResetEvent(false);Thread pump;IntPtr handle;bool closed;int offset;long position;Exception error;
    static readonly uint HeaderSize=(uint)Marshal.SizeOf(typeof(Header));
    public WaveInput(string id){
      var format=new Format{Tag=1,Channels=1,Rate=16000,Bytes=32000,Align=2,Bits=16};
      try{Check(waveInOpen(out handle,unchecked((uint)AudioDevices.InputIndex(id)),ref format,signal.SafeWaitHandle.DangerousGetHandle(),IntPtr.Zero,0x50000));
        for(int i=0;i<4;i++){IntPtr header=Marshal.AllocHGlobal((int)HeaderSize);var value=new Header{Data=Marshal.AllocHGlobal(3200),Length=3200};Marshal.StructureToPtr(value,header,false);headers.Add(header);Check(waveInPrepareHeader(handle,header,HeaderSize));Check(waveInAddBuffer(handle,header,HeaderSize));}
        Check(waveInStart(handle));pump=new Thread(Pump){IsBackground=true,Name="DailyPet microphone"};pump.Start();
      }catch{Dispose();throw;}
    }
    void Pump(){
      try{while(true){signal.WaitOne();lock(gate){if(closed)return;
        foreach(var pointer in headers){var h=(Header)Marshal.PtrToStructure(pointer,typeof(Header));if((h.Flags&1)==0)continue;
          if(h.Recorded>0){var bytes=new byte[h.Recorded];Marshal.Copy(h.Data,bytes,0,bytes.Length);if(pending.Count>=50){pending.Dequeue();offset=0;}pending.Enqueue(bytes);Monitor.PulseAll(gate);}
          Check(waveInAddBuffer(handle,pointer,HeaderSize));
        }
      }}}catch(Exception e){lock(gate){error=e;Monitor.PulseAll(gate);}}
    }
    public override int Read(byte[] buffer,int start,int count){
      if(buffer==null)throw new ArgumentNullException("buffer");if(start<0||count<0||start>buffer.Length-count)throw new ArgumentOutOfRangeException();if(count==0)return 0;
      lock(gate){while(!closed&&error==null&&pending.Count==0)Monitor.Wait(gate);if(error!=null)throw new IOException("麥克風讀取中斷。",error);if(closed)return 0;
        var bytes=pending.Peek();int take=Math.Min(count,bytes.Length-offset);Array.Copy(bytes,offset,buffer,start,take);offset+=take;position+=take;if(offset==bytes.Length){pending.Dequeue();offset=0;}return take;}
    }
    protected override void Dispose(bool disposing){
      lock(gate){if(closed)return;closed=true;pending.Clear();Monitor.PulseAll(gate);}
      signal.Set();if(pump!=null)pump.Join();if(handle!=IntPtr.Zero){waveInReset(handle);foreach(var pointer in headers){waveInUnprepareHeader(handle,pointer,HeaderSize);var h=(Header)Marshal.PtrToStructure(pointer,typeof(Header));Marshal.FreeHGlobal(h.Data);Marshal.FreeHGlobal(pointer);}headers.Clear();waveInClose(handle);handle=IntPtr.Zero;}
      signal.Dispose();base.Dispose(disposing);
    }
    public override bool CanRead{get{return !closed;}}public override bool CanSeek{get{return false;}}public override bool CanWrite{get{return false;}}
    // SAPI queries stream length even for a non-seekable live input.
    public override long Length{get{return long.MaxValue;}}public override long Position{get{lock(gate)return position;}set{throw new NotSupportedException();}}
    public override void Flush(){}public override long Seek(long o,SeekOrigin s){if(o==0&&s==SeekOrigin.Current)return Position;if(s==SeekOrigin.Begin&&o==Position)return Position;throw new NotSupportedException();}public override void SetLength(long n){throw new NotSupportedException();}public override void Write(byte[] b,int o,int n){throw new NotSupportedException();}
  }
}
