package tw.dailyagent.pet;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.Point;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;

public final class PetService extends Service {
  public static PetService current;
  public static boolean settingsVisible=false;
  public AgentClient client;
  private WindowManager windows;
  private PetView pet;private BubbleView bubble;
  private WindowManager.LayoutParams petParams,bubbleParams;
  private final Handler main=new Handler(Looper.getMainLooper());
  private float petScale=1;
  @Override public void onCreate(){super.onCreate();current=this;
    NotificationManager notifications=getSystemService(NotificationManager.class);notifications.createNotificationChannel(new NotificationChannel("connection","桌寵連線狀態",NotificationManager.IMPORTANCE_LOW));
    PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,PetActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,PetService.class).setAction("stop"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
    Notification notification=new Notification.Builder(this,"connection").setSmallIcon(R.drawable.pet_icon).setContentTitle("日常桌寵正在陪伴").setContentText("連回電腦運算；點一下聊天").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"關閉桌寵",stop).build()).build();
    if(Build.VERSION.SDK_INT>=34)startForeground(1,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);else startForeground(1,notification);
    windows=getSystemService(WindowManager.class);client=new AgentClient(this);client.observer=this::refresh;refresh();
  }
  @Override public int onStartCommand(Intent intent,int flags,int id){if(intent!=null&&"stop".equals(intent.getAction())){stopSelf();if(PetActivity.visible!=null)PetActivity.visible.finish();}return START_NOT_STICKY;}
  @Override public IBinder onBind(Intent i){return null;}
  public boolean overlayEnabled(){return getSharedPreferences("pet",0).getBoolean("overlay",false)&&Settings.canDrawOverlays(this);}
  public void refresh(){
    if(PetActivity.visible!=null||settingsVisible){removeOverlay();if(PetActivity.visible!=null)PetActivity.visible.render();return;}
    if(!overlayEnabled()){removeOverlay();return;}
    if(pet==null){
      petScale=Policies.petScale(getSharedPreferences("pet",0).getFloat("scale",1));pet=new PetView(this);petParams=new WindowManager.LayoutParams((int)(dp(112)*petScale),(int)(dp(138)*petScale),WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);petParams.gravity=Gravity.TOP|Gravity.LEFT;
      Point screen=screen();petParams.x=getSharedPreferences("pet",0).getInt("petX",Math.max(0,screen.x-dp(130)));petParams.y=getSharedPreferences("pet",0).getInt("petY",screen.y-dp(260));clampPet();
      pet.setOnTouchListener(new PetGestures(pet,new PetGestures.Actions(){
        public void tap(){pet.playGesture("waving");client.touch();startActivity(new Intent(PetService.this,PetActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));}
        public void hold(){pet.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);startActivity(new Intent(PetService.this,SettingsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));}
        public void drag(float dx,float dy){pet.movement(dx);petParams.x+=(int)dx;petParams.y+=(int)dy;clampPet();windows.updateViewLayout(pet,petParams);placeBubble();}
        public void scale(float factor){int oldW=petParams.width,oldH=petParams.height;petScale=Policies.petScale(petScale*factor);petParams.width=(int)(dp(112)*petScale);petParams.height=(int)(dp(138)*petScale);petParams.x+=(oldW-petParams.width)/2;petParams.y+=oldH-petParams.height;clampPet();windows.updateViewLayout(pet,petParams);placeBubble();}
        public void end(){pet.endMovement();getSharedPreferences("pet",0).edit().putInt("petX",petParams.x).putInt("petY",petParams.y).putFloat("scale",petScale).apply();}
      }));
      bubble=new BubbleView(this,null);bubbleParams=new WindowManager.LayoutParams(Math.min(dp(320),screen.x-dp(24)),WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);bubbleParams.gravity=Gravity.TOP|Gravity.LEFT;
      try{windows.addView(pet,petParams);windows.addView(bubble,bubbleParams);}catch(Exception e){removeOverlay();return;}
    }
    pet.setBusy(client.busy);pet.react(client.text);bubble.setGeneratedImage(client.generatedImage);bubble.setHistoryMode(client.historyMode);bubble.render(client.historyMode&&!client.history.isEmpty()?client.history:client.text,client.connection);
    bubble.post(this::placeBubble);
  }
  private Point screen(){Point point=new Point();windows.getDefaultDisplay().getSize(point);return point;}
  private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
  private void clampPet(){Point screen=screen();petParams.x=Math.max(0,Math.min(screen.x-petParams.width,petParams.x));petParams.y=Math.max(dp(24),Math.min(screen.y-petParams.height-dp(24),petParams.y));}
  private void placeBubble(){if(bubble==null||pet==null||bubble.getParent()==null)return;Point s=screen();int w=bubbleParams.width,h=Math.max(dp(80),bubble.getHeight()),gap=dp(8);int x=petParams.x+(petParams.width-w)/2,y=petParams.y-h-gap;
    if(y<dp(24)){if(petParams.x+petParams.width+w+gap<s.x){x=petParams.x+petParams.width+gap;y=petParams.y;}else if(petParams.x-w-gap>=0){x=petParams.x-w-gap;y=petParams.y;}else y=petParams.y+petParams.height+gap;}
    bubbleParams.x=Math.max(dp(8),Math.min(s.x-w-dp(8),x));bubbleParams.y=Math.max(dp(24),Math.min(s.y-h-dp(24),y));try{windows.updateViewLayout(bubble,bubbleParams);}catch(Exception ignored){}}
  private void removeOverlay(){if(pet!=null){try{windows.removeView(pet);}catch(Exception ignored){}pet=null;}if(bubble!=null){try{windows.removeView(bubble);}catch(Exception ignored){}bubble=null;}}
  @Override public void onConfigurationChanged(android.content.res.Configuration config){super.onConfigurationChanged(config);removeOverlay();refresh();}
  @Override public void onDestroy(){current=null;removeOverlay();if(client!=null){client.observer=null;client.close();}stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
}
