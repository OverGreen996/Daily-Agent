package tw.dailyagent.pet;
import android.app.Notification;
import android.service.notification.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
public final class PhoneNotifications extends NotificationListenerService {
  @Override public void onNotificationPosted(StatusBarNotification item){
    PetService service=PetService.current;Notification n=item.getNotification();
    if(!Policies.notification(getPackageName(),item.getPackageName(),item.isOngoing(),(n.flags&Notification.FLAG_GROUP_SUMMARY)!=0,getSharedPreferences("pet",0).getBoolean("notifications",false),service!=null))return;
    try{String app=item.getPackageName();try{app=getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(item.getPackageName(),0)).toString();}catch(Exception ignored){}byte[] digest=MessageDigest.getInstance("SHA-256").digest((item.getKey()+":"+(item.getPostTime()/60000)).getBytes(StandardCharsets.UTF_8));StringBuilder id=new StringBuilder();for(byte b:digest)id.append(String.format("%02x",b));service.client.notification(id.toString(),app.substring(0,Math.min(120,app.length())));}catch(Exception ignored){}
  }
}
