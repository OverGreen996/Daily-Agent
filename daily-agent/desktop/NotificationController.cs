using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;
namespace DailyPet {
  sealed class NotificationController : IDisposable {
    readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    readonly HashSet<uint> seen=new HashSet<uint>();
    public Action<string,string> Received;
    public Action<string> Failed;
    bool polling;
    public bool Enabled {get;private set;}
    public NotificationController(){timer.Interval=60000;timer.Tick+=async delegate{try{await Poll(false);}catch(Exception e){Stop();if(Failed!=null)Failed(e.Message);}};}
    public async Task Start(){
      var access=await UserNotificationListener.Current.RequestAccessAsync();
      if(access!=UserNotificationListenerAccessStatus.Allowed)throw new Exception("Windows 尚未允許讀取通知。需要具有套件身分的桌寵，並在系統授權視窗允許通知存取。");
      seen.Clear();await Poll(true);Enabled=true;timer.Start();
    }
    async Task Poll(bool initial){
      if(polling)return;polling=true;
      try{
        var list=await UserNotificationListener.Current.GetNotificationsAsync(NotificationKinds.Toast);
        var current=new HashSet<uint>();
        foreach(var n in list){current.Add(n.Id);if(!initial && Enabled && !seen.Contains(n.Id) && Received!=null)Received(n.Id.ToString(),n.AppInfo.DisplayInfo.DisplayName);}
        seen.Clear();foreach(uint id in current)seen.Add(id);
      }finally{polling=false;}
    }
    public void Stop(){Enabled=false;timer.Stop();seen.Clear();}
    public void Dispose(){Stop();timer.Dispose();}
  }
}
