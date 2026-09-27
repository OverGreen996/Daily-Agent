using System;
using System.IO;
using System.Linq;
using System.Globalization;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
using System.Text.RegularExpressions;
using System.Text;
using System.Security;
using System.Threading.Tasks;
using System.Collections.Generic;
namespace DailyPet {
  sealed class AudioLevel {public double Peak,RmsDb;public int Samples;}
  sealed class VoiceController : IDisposable {
    SpeechRecognitionEngine recognizer;
    SherpaStt stt;
    object speaker;
    WaveOutput waveOutput;
    StreamingWaveOutput streamingOutput;
    KokoroTts kokoro;
    WaveInput microphone;
    readonly System.Windows.Forms.Timer speechTimer=new System.Windows.Forms.Timer{Interval=100};
    public string Root="",InputDeviceId="",OutputDeviceId="",VoiceId="",TtsEngine="windows",KokoroVoiceId="zf_001";
    public double SpeechSpeed=1.05;
    public bool Listening {get; private set;}
    public bool Speaking {get; private set;}
    public bool KokoroWarm{get{return kokoro!=null&&kokoro.Warm;}}
    public Action<string> Heard;
    public Action<string> Failed;
    public string WakeName="露米";
    public bool RequireWakeName=false;
    public const float NamedSpeechThreshold=.20f;
    public const float DirectSpeechThreshold=.22f;
    DateTime quietUntil=DateTime.MinValue;
    DateTime lastDispatch=DateTime.MinValue;string lastDispatchText="";
    bool unloadAfterSpeech;
    readonly Queue<string> speechQueue=new Queue<string>();bool queueMode,queueFinishing;
    public VoiceController(){speechTimer.Tick+=delegate{try{bool done=streamingOutput!=null?streamingOutput.Done:waveOutput!=null?waveOutput.Done:speaker!=null&&Convert.ToBoolean(AudioDevices.Call(speaker,"WaitUntilDone",0));if(done){speechTimer.Stop();ReleaseWaveOutput();if(kokoro!=null){kokoro.Cleanup();if(unloadAfterSpeech)kokoro.Unload();}unloadAfterSpeech=false;quietUntil=DateTime.UtcNow.AddSeconds(1);Speaking=false;if(queueMode&&speechQueue.Count>0)StartQueued();else if(queueFinishing){queueMode=false;queueFinishing=false;}}}catch(Exception e){StopSpeaking();if(Failed!=null)Failed("語音播放失敗："+e.GetBaseException().Message);}};}
    public void SelectInput(string id){
      AudioDevices.InputIndex(id);bool restart=Listening;string old=InputDeviceId;Stop();InputDeviceId=id??"";
      try{if(restart)Start();}catch{InputDeviceId=old;try{if(restart)Start();}catch{}throw;}
    }
    public void SelectOutput(string id){
      if(!String.IsNullOrEmpty(id)&&!AudioDevices.Outputs().Any(d=>String.Equals(d.Id,id,StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("選定的播放裝置未連接。");
      StopSpeaking();AudioDevices.Release(speaker);speaker=null;OutputDeviceId=id??"";
    }
    public void SelectVoice(string id){
      if(!String.IsNullOrEmpty(id)&&!AudioDevices.Voices().Any(d=>String.Equals(d.Id,id,StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("選定的 TTS 聲線已無法使用。");
      StopSpeaking();AudioDevices.Release(speaker);speaker=null;VoiceId=id??"";
    }
    public void SelectTtsEngine(string id){if(id!="windows"&&id!="kokoro")throw new ArgumentException("未知的 TTS 引擎");StopSpeaking();if(id=="kokoro"&&!EnsureKokoro().Available)throw new InvalidOperationException("Kokoro 本機模型尚未安裝完整。");if(id!="kokoro"&&kokoro!=null)kokoro.Unload();TtsEngine=id;}
    public void SelectKokoroVoice(string id){if(KokoroVoiceCatalog.Find(id)==null)throw new InvalidOperationException("找不到 Kokoro 聲線。");StopSpeaking();KokoroVoiceId=id;}
    public void SetSpeechSpeed(double speed){StopSpeaking();SpeechSpeed=Math.Max(.7,Math.Min(1.4,speed));}
    KokoroTts EnsureKokoro(){if(kokoro==null)kokoro=new KokoroTts(Root);return kokoro;}
    public Task WarmKokoro(){return EnsureKokoro().WarmUp();}
    public void UnloadTts(){StopSpeaking();if(kokoro!=null)kokoro.Unload();}
    public static string Command(string text,string name,float confidence,float threshold=.55f) {
      if(confidence<threshold)return null;
      var match=Regex.Match(text.Trim(),"^(?:"+Regex.Escape(name)+"|露米|路米|嚕米|Lumi)[，,。:：!！\\s]*(.+)$",RegexOptions.IgnoreCase);
      return match.Success ? match.Groups[1].Value.Trim() : null;
    }
    public static Grammar WakeGrammar(string name){var words=new Choices(new string[]{name,"露米","路米","嚕米","Lumi"});var builder=new GrammarBuilder {Culture=new CultureInfo("zh-TW")};builder.Append(words);builder.AppendDictation();return new Grammar(builder);}
    public static Grammar CommonGrammar(string name){var builder=new GrammarBuilder {Culture=new CultureInfo("zh-TW")};builder.Append(new Choices(new string[]{name,"露米","路米","嚕米","Lumi"}));builder.Append(new Choices(new string[]{"現在幾點","今天天氣如何","查看目前狀態","進入待機","查看文件庫","打開記憶宮殿","開啟語音回覆","關閉語音回覆","關閉語音","查看行事曆","開啟天氣提醒","關閉天氣提醒"}));return new Grammar(builder){Priority=100};}
    void LogRecognition(string kind,RecognitionResult result){
      try{string dir=Path.Combine(Root,".daily-runtime","native-pet");Directory.CreateDirectory(dir);File.AppendAllText(Path.Combine(dir,"voice-recognition.log"),DateTime.Now.ToString("O")+"\t"+kind+"\t"+(result==null?"":result.Confidence.ToString("0.000",CultureInfo.InvariantCulture))+"\t"+(result==null?"":result.Text)+Environment.NewLine,Encoding.UTF8);}catch{}
    }
    void Consider(RecognitionResult result,string kind){
      LogRecognition(kind,result);if(result==null||!Listening||Speaking||DateTime.UtcNow<quietUntil)return;
      string command=Command(result.Text,WakeName,result.Confidence,NamedSpeechThreshold);
      if(command==null&&!RequireWakeName&&result.Confidence>=DirectSpeechThreshold){string direct=result.Text.Trim();if(direct.Length>=2)command=direct;}
      if(String.IsNullOrWhiteSpace(command))return;
      if(command==lastDispatchText&&(DateTime.UtcNow-lastDispatch).TotalSeconds<2)return;
      lastDispatchText=command;lastDispatch=DateTime.UtcNow;if(Heard!=null)Heard(command);
    }
    void ConsiderSherpa(string text){
      try{string dir=Path.Combine(Root,".daily-runtime","native-pet");Directory.CreateDirectory(dir);File.AppendAllText(Path.Combine(dir,"voice-recognition.log"),DateTime.Now.ToString("O")+"\tsherpa\t1.000\t"+text+Environment.NewLine,Encoding.UTF8);}catch{}
      if(!Listening||Speaking||DateTime.UtcNow<quietUntil||String.IsNullOrWhiteSpace(text))return;
      string command=Command(text,WakeName,1,0);if(command==null&&!RequireWakeName)command=text.Trim();if(String.IsNullOrWhiteSpace(command))return;
      if(command==lastDispatchText&&(DateTime.UtcNow-lastDispatch).TotalSeconds<2)return;lastDispatchText=command;lastDispatch=DateTime.UtcNow;if(Heard!=null)Heard(command);
    }
    public void Start() {
      if(Listening)return;
      stt=new SherpaStt(Root);
      if(stt.Available){
        try{stt.Start(InputDeviceId,ConsiderSherpa,delegate(string error){Listening=false;if(Failed!=null)Failed(error);});Listening=true;return;}
        catch{stt.Dispose();stt=null;throw;}
      }
      var info=SpeechRecognitionEngine.InstalledRecognizers().FirstOrDefault(r=>r.Culture.Name=="zh-TW");
      if(info==null)throw new Exception("Windows 尚未安裝繁體中文語音辨識。請先在 Windows 語言設定加入語音功能。");
      recognizer=new SpeechRecognitionEngine(info);
      try {
        recognizer.LoadGrammar(new DictationGrammar());
        recognizer.LoadGrammar(WakeGrammar(WakeName));
        recognizer.LoadGrammar(CommonGrammar(WakeName));
        recognizer.SpeechRecognized+=delegate(object s,SpeechRecognizedEventArgs e) {if(s==recognizer)Consider(e.Result,"accepted");};
        recognizer.SpeechRecognitionRejected+=delegate(object s,SpeechRecognitionRejectedEventArgs e) {if(s==recognizer)Consider(e.Result,"rejected");};
        recognizer.RecognizeCompleted+=delegate(object s,RecognizeCompletedEventArgs e) {
          if(s==recognizer && e.Error!=null && Listening){Listening=false;if(Failed!=null)Failed(e.Error.Message);}
        };
        if(String.IsNullOrEmpty(InputDeviceId))recognizer.SetInputToDefaultAudioDevice();
        else {microphone=new WaveInput(InputDeviceId);recognizer.SetInputToAudioStream(microphone,new SpeechAudioFormatInfo(16000,AudioBitsPerSample.Sixteen,AudioChannel.Mono));}
        Listening=true;
        recognizer.RecognizeAsync(RecognizeMode.Multiple);
      }catch{Stop();throw;}
    }
    public void Stop() {
      Listening=false;
      if(stt!=null){stt.Dispose();stt=null;}
      if(microphone!=null){microphone.Dispose();microphone=null;}
      if(recognizer!=null){try{recognizer.RecognizeAsyncCancel();}catch(InvalidOperationException){}finally{recognizer.Dispose();recognizer=null;}}
    }
    public async Task<AudioLevel> MeasureInput(){bool restart=Listening;Stop();try{return await Task.Run(()=>{using(var input=new WaveInput(InputDeviceId)){var bytes=new byte[96000];int total=0;while(total<bytes.Length){int read=input.Read(bytes,total,bytes.Length-total);if(read<=0)break;total+=read;}double sum=0,peak=0;int samples=total/2;for(int i=0;i+1<total;i+=2){double value=Math.Abs((double)BitConverter.ToInt16(bytes,i))/32768;peak=Math.Max(peak,value);sum+=value*value;}double rms=samples>0?Math.Sqrt(sum/samples):0;return new AudioLevel{Peak=peak,RmsDb=rms>0?20*Math.Log10(rms):-100,Samples=samples};}});}finally{if(restart)try{Start();}catch{}}}
    public void Say(string text) { SayInternal(text,false); }
    public void SayPreview(string text) { SayInternal(text,true); }
    public void BeginResponseSpeech(){StopSpeaking();queueMode=true;queueFinishing=false;}
    public void QueueResponseSpeech(string text){text=CleanText(text);if(String.IsNullOrWhiteSpace(text))return;if(!queueMode)BeginResponseSpeech();speechQueue.Enqueue(text);if(!Speaking)StartQueued();}
    public void EndResponseSpeech(){if(!queueMode)return;queueFinishing=true;if(!Speaking&&speechQueue.Count==0){queueMode=false;queueFinishing=false;}}
    void StartQueued(){if(!queueMode||speechQueue.Count==0)return;StartText(speechQueue.Dequeue());}
    void SayInternal(string text,bool preview) {
      StopSpeaking();
      unloadAfterSpeech=preview&&TtsEngine=="kokoro"&&!KokoroWarm;
      text=CleanText(text);
      StartText(text);
    }
    void StartText(string text){
      if(TtsEngine=="kokoro"){SayKokoro(text);return;}
      AudioDevices.Release(speaker);speaker=null; // Resolve default/explicit endpoint afresh for each utterance.
      if(speaker==null){
        speaker=AudioDevices.NewSpeaker();
        try{AudioDevices.SelectOutput(speaker,OutputDeviceId);AudioDevices.SelectVoice(speaker,VoiceId);
          AudioDevices.Set(speaker,"Rate",Math.Max(-3,Math.Min(4,(int)Math.Round((SpeechSpeed-1)*10))));
        }catch{AudioDevices.Release(speaker);speaker=null;throw;}
      }
      try{Speaking=true;quietUntil=DateTime.UtcNow.AddSeconds(1);AudioDevices.Call(speaker,"Speak",text,17);speechTimer.Start();}catch{Speaking=false;throw;}
    }
    string CleanText(string text){text=Regex.Replace(text,@"https?://\S+|```[\s\S]*?```","");text=Regex.Replace(text,@"[*#_`|]","");if(text.Length>350)text=text.Substring(0,350)+"。後面還有內容，可以在泡泡裡繼續看。";return text;}
    void ReleaseWaveOutput(){if(streamingOutput!=null){streamingOutput.Dispose();streamingOutput=null;}if(waveOutput!=null){waveOutput.Dispose();waveOutput=null;}}
    async void SayKokoro(string text){
      try{Speaking=true;quietUntil=DateTime.UtcNow.AddSeconds(1);var output=new StreamingWaveOutput(OutputDeviceId);streamingOutput=output;string wav=await EnsureKokoro().Generate(text,KokoroVoiceId,SpeechSpeed,bytes=>output.Add(bytes));if(!Speaking){EnsureKokoro().Cleanup();return;}
        if(streamingOutput.HasAudio){streamingOutput.Complete();speechTimer.Start();}else{streamingOutput.Dispose();streamingOutput=null;waveOutput=new WaveOutput(wav,OutputDeviceId);speechTimer.Start();}
      }catch(Exception e){Speaking=false;speechQueue.Clear();queueMode=false;queueFinishing=false;ReleaseWaveOutput();EnsureKokoro().Cleanup();if(unloadAfterSpeech)EnsureKokoro().Unload();unloadAfterSpeech=false;if(Failed!=null)Failed("Kokoro 語音失敗："+e.GetBaseException().Message);}
    }
    public void StopSpeaking(){speechTimer.Stop();speechQueue.Clear();queueMode=false;queueFinishing=false;if(speaker!=null)try{AudioDevices.Call(speaker,"Speak","",3);}catch{}ReleaseWaveOutput();if(kokoro!=null){kokoro.CancelCurrent();if(unloadAfterSpeech)kokoro.Unload();}unloadAfterSpeech=false;Speaking=false;quietUntil=DateTime.UtcNow.AddSeconds(1);}
    public void Dispose(){Stop();StopSpeaking();if(kokoro!=null){kokoro.Dispose();kokoro=null;}speechTimer.Dispose();AudioDevices.Release(speaker);speaker=null;}
  }
}
