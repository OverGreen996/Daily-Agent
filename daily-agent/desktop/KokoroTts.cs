using System;
using System.IO;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace DailyPet {
  sealed class KokoroVoice {
    public readonly string Id,Group;public readonly int Sid;
    public KokoroVoice(string id,int sid,string group){Id=id;Sid=sid;Group=group;}
  }
  static class KokoroVoiceCatalog {
    static readonly string[] Female={"001","002","003","004","005","006","007","008","017","018","019","021","022","023","024","026","027","028","032","036","038","039","040","042","043","044","046","047","048","049","051","059","060","067","070","071","072","073","074","075","076","077","078","079","083","084","085","086","087","088","090","092","093","094","099"};
    static readonly string[] Male={"009","010","011","012","013","014","015","016","020","025","029","030","031","033","034","035","037","041","045","050","052","053","054","055","056","057","058","061","062","063","064","065","066","068","069","080","081","082","089","091","095","096","097","098","100"};
    public static List<KokoroVoice> All(){var r=new List<KokoroVoice>{new KokoroVoice("af_maple",0,"英文女聲"),new KokoroVoice("af_sol",1,"英文女聲"),new KokoroVoice("bf_vale",2,"英文女聲")};int sid=3;foreach(var n in Female)r.Add(new KokoroVoice("zf_"+n,sid++,"中文女聲"));foreach(var n in Male)r.Add(new KokoroVoice("zm_"+n,sid++,"中文男聲"));return r;}
    public static KokoroVoice Find(string id){return All().Find(v=>String.Equals(v.Id,id,StringComparison.OrdinalIgnoreCase));}
  }
  sealed class KokoroTts : IDisposable {
    readonly string root;readonly object gate=new object();readonly JavaScriptSerializer json=new JavaScriptSerializer();Process process;TaskCompletionSource<bool> ready;TaskCompletionSource<Dictionary<string,object>> response;Action<byte[]> responseAudio;string responseId,outputFile,errorText="";
    public bool Available{get{return !String.IsNullOrWhiteSpace(root)&&File.Exists(RuntimePaths.Get(root,"tts","kokoro-multi-lang-v1_1","model.onnx"))&&File.Exists(Path.Combine(root,"daily-agent","scripts","kokoro-tts.cjs"));}}
    public bool Warm{get{lock(gate)return process!=null&&!process.HasExited&&ready!=null&&ready.Task.Status==TaskStatus.RanToCompletion;}}
    public KokoroTts(string root){this.root=root;}
    public async Task WarmUp(){
      Task wait;
      lock(gate){
        if(!Available)throw new InvalidOperationException("Kokoro 本機模型尚未安裝完整。");
        if(process!=null&&!process.HasExited){wait=ready.Task;}
        else{
          ready=new TaskCompletionSource<bool>();errorText="";
          var info=new ProcessStartInfo("node.exe","\""+Path.Combine(root,"daily-agent","scripts","kokoro-tts.cjs")+"\" --worker"){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
          process=new Process{StartInfo=info,EnableRaisingEvents=true};
          process.OutputDataReceived+=OnOutput;process.ErrorDataReceived+=delegate(object s,DataReceivedEventArgs e){if(e.Data!=null)lock(gate)errorText=(errorText+e.Data+"\n").Substring(Math.Max(0,(errorText+e.Data+"\n").Length-2000));};
          process.Exited+=delegate{lock(gate){var reason=new InvalidOperationException("Kokoro 背景程序已結束。"+(String.IsNullOrWhiteSpace(errorText)?"":" "+errorText.Trim()));if(ready!=null)ready.TrySetException(reason);if(response!=null)response.TrySetException(reason);}};
          if(!process.Start())throw new InvalidOperationException("無法啟動 Kokoro 背景程序。");process.BeginOutputReadLine();process.BeginErrorReadLine();wait=ready.Task;
        }
      }
      if(await Task.WhenAny(wait,Task.Delay(30000))!=wait){Unload();throw new TimeoutException("Kokoro 暖機超過三十秒，已停止。");}await wait;
    }
    void OnOutput(object sender,DataReceivedEventArgs e){if(String.IsNullOrWhiteSpace(e.Data))return;try{var data=json.Deserialize<Dictionary<string,object>>(e.Data);lock(gate){if(data.ContainsKey("ready")){ready.TrySetResult(true);return;}if(response!=null&&Convert.ToString(data["id"])==responseId){if(data.ContainsKey("audio")){try{if(responseAudio!=null)responseAudio(Convert.FromBase64String(Convert.ToString(data["audio"])));}catch(Exception ex){response.TrySetException(ex);}return;}response.TrySetResult(data);}}}catch{/* native diagnostics are ignored; protocol lines are JSON */}}
    public async Task<string> Generate(string text,string voiceId,double speed,Action<byte[]> onAudio=null){
      var voice=KokoroVoiceCatalog.Find(String.IsNullOrEmpty(voiceId)?"zf_001":voiceId);if(voice==null)throw new InvalidOperationException("找不到選定的 Kokoro 聲線。");await WarmUp();Cleanup();
      string id=Guid.NewGuid().ToString("N"),outputDir=RuntimePaths.Get(root,"tts-output");Directory.CreateDirectory(outputDir);outputFile=Path.Combine(outputDir,id+".wav");Task<Dictionary<string,object>> wait;
      lock(gate){if(response!=null&&!response.Task.IsCompleted)throw new InvalidOperationException("Kokoro 正在產生上一段語音。");responseId=id;responseAudio=onAudio;response=new TaskCompletionSource<Dictionary<string,object>>();wait=response.Task;string textBase64=Convert.ToBase64String(Encoding.UTF8.GetBytes(text));process.StandardInput.WriteLine(json.Serialize(new {id=id,textBase64=textBase64,sid=voice.Sid,speed=Math.Max(.7,Math.Min(1.4,speed)),stream=onAudio!=null,output=outputFile}));process.StandardInput.Flush();}
      if(await Task.WhenAny(wait,Task.Delay(60000))!=wait){CancelCurrent();throw new TimeoutException("Kokoro 產生語音超過一分鐘，已停止。");}Dictionary<string,object> result;
      try{result=await wait;}finally{lock(gate){if(response!=null&&wait==response.Task){response=null;responseId=null;responseAudio=null;}}}
      if(!result.ContainsKey("ok")||!Convert.ToBoolean(result["ok"])||!File.Exists(outputFile))throw new InvalidOperationException("Kokoro 語音產生失敗："+Convert.ToString(result.ContainsKey("error")?result["error"]:"沒有輸出檔案"));return outputFile;
    }
    public void CancelCurrent(){lock(gate){if(response!=null&&!response.Task.IsCompleted){Unload();return;}}Cleanup();}
    public void Unload(){Process old=null;lock(gate){old=process;process=null;var reason=new OperationCanceledException("Kokoro 已卸載。");if(ready!=null)ready.TrySetException(reason);if(response!=null)response.TrySetException(reason);ready=null;response=null;responseId=null;responseAudio=null;}if(old!=null){try{if(!old.HasExited)old.Kill();}catch{}try{old.Dispose();}catch{}}Cleanup();}
    public void Cleanup(){if(outputFile!=null)try{File.Delete(outputFile);}catch{}outputFile=null;}
    public void Dispose(){Unload();}
  }
}
