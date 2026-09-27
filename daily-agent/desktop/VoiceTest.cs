using System;
using System.IO;
using System.Linq;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
using System.Web.Script.Serialization;
using System.Threading;
using System.Threading.Tasks;
namespace DailyPet {
  static class VoiceTest {
    [STAThread] static int Main(string[] args){
      string resultFile=Path.Combine(args[0],"voice-report.json");
      try{
        Directory.CreateDirectory(args[0]);
        if(args.Length<2)throw new Exception("Project root required");
        var catalog=KokoroVoiceCatalog.All();if(catalog.Count!=103||catalog.Count(v=>v.Group=="中文女聲")!=55||KokoroVoiceCatalog.Find("zf_001").Sid!=3||KokoroVoiceCatalog.Find("zm_100").Sid!=102)throw new Exception("Kokoro voice catalog mismatch");
        long kokoroBytes=0,firstAudioMs=-1,totalGenerationMs=0;using(var local=new KokoroTts(args[1])){local.WarmUp().GetAwaiter().GetResult();if(!local.Warm)throw new Exception("Kokoro did not warm");var selected=AudioDevices.Outputs().FirstOrDefault();using(var playback=new StreamingWaveOutput(selected==null?"":selected.Id)){var watch=System.Diagnostics.Stopwatch.StartNew();string generated=local.Generate("語音播放測試，現在應該可以聽到我。","zf_073",1.05,bytes=>{Interlocked.CompareExchange(ref firstAudioMs,watch.ElapsedMilliseconds,-1);playback.Add(bytes);}).GetAwaiter().GetResult();totalGenerationMs=watch.ElapsedMilliseconds;playback.Complete();if(firstAudioMs<0||firstAudioMs>=totalGenerationMs)throw new Exception("Kokoro did not stream audio before generation completed");if(!File.Exists(generated)||File.ReadAllBytes(generated).Take(4).Select(x=>(char)x).Aggregate("",(a,b)=>a+b)!="RIFF")throw new Exception("Kokoro WAV invalid");kokoroBytes=new FileInfo(generated).Length;if(kokoroBytes>400000)throw new Exception("Kokoro Chinese input appears misencoded; WAV is unexpectedly long: "+kokoroBytes);var end=DateTime.UtcNow.AddSeconds(15);while(!playback.Done&&DateTime.UtcNow<end)Thread.Sleep(30);if(!playback.Done)throw new Exception("Kokoro streaming playback did not finish");}local.Cleanup();local.Unload();if(local.Warm)throw new Exception("Kokoro did not unload");}
        var inputs=AudioDevices.Inputs();var outputs=AudioDevices.Outputs();var voices=AudioDevices.Voices();int microphoneBytes=0;
        if(inputs.GroupBy(d=>d.Id).Any(g=>g.Count()>1)||outputs.GroupBy(d=>d.Id).Any(g=>g.Count()>1))throw new Exception("Device identities are not unique");
        if(AudioDevices.InputIndex("")!=-1)throw new Exception("Default mapper failed");
        bool rejected=false;try{AudioDevices.InputIndex("missing-device");}catch(InvalidOperationException){rejected=true;}if(!rejected)throw new Exception("Missing microphone silently fell back");
        if(inputs.Count>0){using(var input=new WaveInput(inputs[0].Id)){var bytes=new byte[3200];var read=Task.Run(()=>input.Read(bytes,0,bytes.Length));if(!read.Wait(5000))throw new Exception("Selected microphone delivered no PCM");microphoneBytes=read.Result;if(microphoneBytes==0)throw new Exception("Empty microphone stream");}}
        foreach(var output in outputs){object probe=AudioDevices.NewSpeaker(),token=null;try{AudioDevices.SelectOutput(probe,output.Id);token=AudioDevices.Get(probe,"AudioOutput");if(!String.Equals(Convert.ToString(AudioDevices.Get(token,"Id")),output.Id,StringComparison.OrdinalIgnoreCase))throw new Exception("Wrong output token");AudioDevices.Set(probe,"Volume",0);AudioDevices.Call(probe,"Speak","音訊測試",17);if(!Convert.ToBoolean(AudioDevices.Call(probe,"WaitUntilDone",5000)))throw new Exception("Output test did not finish");}finally{AudioDevices.Release(token);AudioDevices.Release(probe);}}
        using(var controller=new VoiceController()){
          if(inputs.Count>0){controller.SelectInput(inputs[0].Id);controller.Start();Thread.Sleep(300);controller.SelectInput(inputs[0].Id);if(!controller.Listening)throw new Exception("Live microphone switch lost listening");controller.Stop();}
          rejected=false;try{controller.SelectOutput("missing-device");}catch(InvalidOperationException){rejected=true;}if(!rejected)throw new Exception("Missing output silently fell back");
          if(outputs.Count>0)controller.SelectOutput(outputs[0].Id);controller.SelectOutput("");
          foreach(var voice in voices){controller.SelectVoice(voice.Id);object probe=AudioDevices.NewSpeaker(),token=null;try{AudioDevices.SelectVoice(probe,voice.Id);token=AudioDevices.Get(probe,"Voice");if(Convert.ToString(AudioDevices.Get(token,"Id"))!=voice.Id)throw new Exception("Wrong voice token");}finally{AudioDevices.Release(token);AudioDevices.Release(probe);}}
          controller.SelectVoice("");
          controller.Say("語音播放測試。");var deadline=DateTime.UtcNow.AddSeconds(8);while(controller.Speaking&&DateTime.UtcNow<deadline){System.Windows.Forms.Application.DoEvents();Thread.Sleep(30);}if(controller.Speaking)throw new Exception("Speech completion timer failed");
          controller.Say("這段語音應該被立即取消，不繼續播放。");controller.StopSpeaking();if(controller.Speaking)throw new Exception("Speech cancellation failed");
        }
        if(VoiceController.Command("露米現在幾點","露米",0.9f)!="現在幾點" || VoiceController.Command("路米現在幾點","露米",0.9f)!="現在幾點" || VoiceController.Command("背景電視正在講話","露米",0.99f)!=null || VoiceController.Command("露米現在幾點","露米",0.1f)!=null)throw new Exception("Wake filter failed");
        string wav=Path.Combine(args[0],"voice-roundtrip.wav");
        using(var synth=new SpeechSynthesizer()){
          var voice=synth.GetInstalledVoices().First(v=>v.Enabled && v.VoiceInfo.Culture.Name=="zh-TW");synth.SelectVoice(voice.VoiceInfo.Name);synth.SetOutputToWaveFile(wav,new SpeechAudioFormatInfo(16000,AudioBitsPerSample.Sixteen,AudioChannel.Mono));synth.Speak("露米，現在幾點？");
        }
        using(var engine=new SpeechRecognitionEngine(SpeechRecognitionEngine.InstalledRecognizers().First(r=>r.Culture.Name=="zh-TW"))){
          engine.LoadGrammar(new DictationGrammar());engine.LoadGrammar(VoiceController.WakeGrammar("露米"));engine.LoadGrammar(VoiceController.CommonGrammar("露米"));engine.SetInputToWaveFile(wav);var recognized=engine.Recognize(TimeSpan.FromSeconds(10));
          if(recognized==null)throw new Exception("Speech recognition produced no result");
          string command=VoiceController.Command(recognized.Text,"露米",recognized.Confidence,VoiceController.NamedSpeechThreshold);
          if(VoiceController.Command(recognized.Text,"露米",1)!="現在幾點")throw new Exception("Unexpected recognition text: "+recognized.Text);
          if(recognized.Confidence<VoiceController.NamedSpeechThreshold&&command!=null)throw new Exception("Low confidence audio was accepted");
          File.WriteAllText(resultFile,new JavaScriptSerializer().Serialize(new {passed=true,tts=true,kokoroCpu=true,kokoroVoices=catalog.Count,kokoroWavBytes=kokoroBytes,kokoroFirstAudioMs=firstAudioMs,kokoroGenerationMs=totalGenerationMs,kokoroStreamedBeforeComplete=firstAudioMs<totalGenerationMs,kokoroUnloadVerified=true,wavToRecognition=true,recognized=recognized.Text,command=command,syntheticCommandAccepted=command!=null,confidence=recognized.Confidence,inputDevices=inputs.Select(d=>d.Name).ToArray(),outputDevices=outputs.Select(d=>d.Name).ToArray(),ttsVoices=voices.Select(d=>d.Name).ToArray(),microphoneBytes=microphoneBytes,selectedOutputVerified=true,liveMicrophone=inputs.Count>0,humanSpeechVerified=false}));
        }
        return 0;
      }catch(Exception e){File.WriteAllText(resultFile,new JavaScriptSerializer().Serialize(new {passed=false,error=e.ToString()}));return 1;}
    }
  }
}
