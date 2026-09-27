using System;
using System.IO;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace DailyPet {
  sealed class SherpaStt : IDisposable {
    readonly string root;readonly JavaScriptSerializer json=new JavaScriptSerializer();readonly object gate=new object();
    Process process;WaveInput input;Thread capture;ManualResetEventSlim ready;volatile bool running;Action<string> heard;Action<string> failed;string errors="";
    public SherpaStt(string root){this.root=root;}
    string ModelDir{get{return Path.Combine(root,".daily-runtime","stt","sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30");}}
    public bool Available{get{return File.Exists(Path.Combine(ModelDir,"encoder.int8.onnx"))&&File.Exists(Path.Combine(root,"daily-agent","scripts","sherpa-stt.cjs"));}}
    public void Start(string inputId,Action<string> onHeard,Action<string> onFailed){
      if(running)return;if(!Available)throw new InvalidOperationException("Sherpa 中文語音辨識模型尚未安裝完整。");heard=onHeard;failed=onFailed;ready=new ManualResetEventSlim(false);errors="";
      var info=new ProcessStartInfo("node.exe","\""+Path.Combine(root,"daily-agent","scripts","sherpa-stt.cjs")+"\" --worker"){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
      process=new Process{StartInfo=info,EnableRaisingEvents=true};process.OutputDataReceived+=Output;process.ErrorDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null)lock(gate)errors=(errors+e.Data+"\n").Substring(Math.Max(0,(errors+e.Data+"\n").Length-2000));};
      process.Exited+=delegate{if(running){running=false;var callback=failed;if(callback!=null)callback("本機中文語音辨識程序已結束。"+(String.IsNullOrWhiteSpace(errors)?"":" "+errors.Trim()));}};
      if(!process.Start())throw new InvalidOperationException("無法啟動本機中文語音辨識。");process.BeginOutputReadLine();process.BeginErrorReadLine();
      if(!ready.Wait(30000)){Stop();throw new TimeoutException("中文語音辨識模型載入超過三十秒。");}
      input=new WaveInput(inputId);running=true;capture=new Thread(Capture){IsBackground=true,Name="DailyPet Sherpa STT"};capture.Start();
    }
    void Output(object sender,DataReceivedEventArgs e){if(String.IsNullOrWhiteSpace(e.Data))return;try{var d=json.Deserialize<Dictionary<string,object>>(e.Data);if(d.ContainsKey("ready")){ready.Set();return;}if(d.ContainsKey("error")){var callback=failed;if(callback!=null)callback("語音辨識失敗："+Convert.ToString(d["error"]));return;}if(d.ContainsKey("final")){string text=Convert.ToString(d["text"]);if(!String.IsNullOrWhiteSpace(text)){var callback=heard;if(callback!=null)callback(text);}}}catch{}}
    void Capture(){
      try{var bytes=new byte[3200];while(running){int count=input.Read(bytes,0,bytes.Length);if(count<=0)break;byte[] part=bytes;if(count!=bytes.Length){part=new byte[count];Array.Copy(bytes,part,count);}lock(gate){if(!running||process==null||process.HasExited)break;process.StandardInput.WriteLine(json.Serialize(new{audio=Convert.ToBase64String(part)}));process.StandardInput.Flush();}}}
      catch(Exception e){if(running){var callback=failed;if(callback!=null)callback("麥克風串流中斷："+e.GetBaseException().Message);}}
    }
    public void Stop(){
      running=false;var oldInput=input;input=null;if(oldInput!=null)try{oldInput.Dispose();}catch{}if(capture!=null&&capture!=Thread.CurrentThread)try{capture.Join(2000);}catch{}capture=null;
      var old=process;process=null;if(old!=null){try{if(!old.HasExited){old.StandardInput.WriteLine("{\"stop\":true}");old.StandardInput.Flush();if(!old.WaitForExit(1500))old.Kill();}}catch{try{old.Kill();}catch{}}try{old.Dispose();}catch{}}
      if(ready!=null){ready.Dispose();ready=null;}
    }
    public void Dispose(){Stop();}
  }
}
