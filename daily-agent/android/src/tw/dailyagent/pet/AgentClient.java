package tw.dailyagent.pet;
import android.content.Context;
import android.os.*;
import org.json.*;
import javax.net.ssl.HttpsURLConnection;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class AgentClient {
  public interface Observer {void changed();}
  public volatile String text="嗨，我是露米。\n先在電腦說「開啟 Cloudflare 連線」和「開啟手機配對」，再把這句傳給我：\n\n連線 https://你的網址 12345678\n\n說「使用說明」可以查看操作方式。",history="",connection="尚未配對";
  public volatile boolean busy=false,online=false,initialized=false,pairing=false;
  public volatile File generatedImage;
  public volatile boolean historyMode=false;
  public void setHistoryMode(boolean enabled){historyMode=enabled;context.getSharedPreferences("pet",0).edit().putBoolean("historyMode",enabled).apply();changed();}
  public volatile Observer observer;
  public volatile JSONArray files=new JSONArray();
  private final SecureStore store;
  private final AppearanceSync appearance;
  private final Context context;
  private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
  private final Handler main=new Handler(Looper.getMainLooper());
  private volatile String base="",token="";
  private String job="",deviceId="";
  private JSONObject pending;
  private long cursor=0,lastSession=0,lastEvents=0,nextAttempt=0,sentTouch=0;
  private volatile long lastTouch=System.currentTimeMillis();
  private int failures=0;
  private long lastAppearance=0;
  private volatile boolean closed=false;
  private final Policies.NoticeGate notices=new Policies.NoticeGate();
  private final ArrayDeque<JSONObject> outbound=new ArrayDeque<>();
  public AgentClient(Context context){
    this.context=context.getApplicationContext();historyMode=false;appearance=new AppearanceSync(context);
    store=new SecureStore(context);
    worker.execute(()->{try{String saved=store.get("connection");if(saved!=null){JSONObject c=new JSONObject(saved);base=Policies.server(c.getString("url"));token=c.getString("token");deviceId=c.optString("deviceId");cursor=c.optLong("cursor");connection="正在連線…";text="我回來了，可以繼續聊。";}
      String p=store.get("pending");if(p!=null){JSONObject state=new JSONObject(p);pending=state.getJSONObject("request");job=state.optString("job");busy=true;text="正在接回上一個問題…";}
      String h=store.get("history");if(h!=null)history=h;
    }catch(Exception e){say("無法讀取配對資料，請重新配對。",false);}initialized=true;changed();});
    worker.scheduleWithFixedDelay(this::tick,1,1,TimeUnit.SECONDS);
  }
  public void openFreshBubble(){if(!busy&&!pairing&&initialized&&paired()){historyMode=false;text="";generatedImage=null;changed();}}
  public void touch(){lastTouch=System.currentTimeMillis();}
  public void say(String value,boolean save){if(closed)return;text=value;changed();if(save)execute(()->remember("露米",value));}
  public void execute(Runnable work){if(closed)return;try{worker.execute(()->{if(!closed)work.run();});}catch(RejectedExecutionException ignored){}}
  private void changed(){if(!closed)main.post(()->{if(!closed&&observer!=null)observer.changed();});}
  public boolean paired(){return !token.isEmpty();}
  private void saveConnection()throws Exception{store.put("connection",new JSONObject().put("url",base).put("token",token).put("deviceId",deviceId).put("cursor",cursor).toString());}
  private void savePending()throws Exception{store.put("pending",pending==null?null:new JSONObject().put("job",job).put("request",pending).toString());}
  private void remember(String who,String value){try{history=(history+"\n\n"+who+"："+value);if(history.length()>24000)history=history.substring(history.length()-24000);store.put("history",history);}catch(Exception ignored){}}
  public synchronized void pair(String url,String code){if(closed||pairing)return;pairing=true;connection="正在配對…";changed();execute(()->{try{
    String target=Policies.server(url);if(!code.matches("[0-9]{8}"))throw new Exception("配對碼是八位數字。");
    JSONObject reply=request(target,"/v1/pair",new JSONObject().put("code",code).put("name",Build.MANUFACTURER+" "+Build.MODEL).put("replaceDeviceId",deviceId),"");
    String newToken=reply.getString("token");if(!newToken.matches("[a-f0-9]{64}"))throw new Exception("配對回應不正確。");base=target;token=newToken;deviceId=reply.getJSONObject("device").getString("id");
    pending=null;job="";generatedImage=null;cursor=0;busy=false;nextAttempt=0;lastEvents=0;lastSession=0;lastAppearance=0;sentTouch=0;failures=0;outbound.clear();notices.clear();files=new JSONArray();savePending();saveConnection();online=true;connection="已連線";
    say("連上電腦了。你可以直接聊天，或說「傳圖片」、「搜尋電腦檔案 關鍵字」。\n\n說「開啟桌寵懸浮」讓我待在手機畫面上；「開啟通知偵測」讓我留意手機通知。",true);
  }catch(Exception e){connection=paired()?"配對未更換，保留原連線":"尚未配對";say("配對沒有完成："+e.getMessage(),false);}finally{pairing=false;changed();}});}
  public synchronized boolean submit(String question,String image,String file){return submit(question,image,file,null);}
  public synchronized boolean submit(String question,String image,String file,JSONObject location){if(closed||busy||pairing||!paired())return false;busy=true;generatedImage=null;touch();execute(()->{try{
    JSONObject next=new JSONObject().put("text",question).put("requestId",UUID.randomUUID().toString());if(image!=null)next.put("image",image);if(file!=null)next.put("file",file);
    if(location!=null)next.put("location",location);
    pending=next;job="";busy=true;savePending();remember("你",question);say("讓我想想…",false);nextAttempt=0;
  }catch(Exception e){pending=null;job="";busy=false;try{savePending();}catch(Exception ignored){}say(e.getMessage(),false);}});return true;}
  public void reconnect(){execute(()->{if(!paired()){say("請先配對電腦。",false);return;}nextAttempt=0;failures=0;lastSession=0;lastEvents=0;connection="正在重新連線…";changed();tick();});}
  public void syncAppearance(){execute(()->{if(!paired()){say("請先配對電腦。",false);return;}if(busy){connection="回答完成後再同步外觀";lastAppearance=0;changed();return;}try{boolean updated=checkAppearance();say(updated?"收到電腦傳來的新外觀了。":"外觀已是最新；若尚未發布，請在電腦說「傳送外觀到手機」。",false);}catch(Exception e){say("外觀同步未完成："+e.getMessage()+"。原外觀保留。",false);}});}
  private boolean checkAppearance()throws Exception{lastAppearance=System.currentTimeMillis();JSONObject meta=request(base,"/v1/appearance",null,token);boolean updated=appearance.update(base,token,meta);if(updated)main.post(()->{if(!closed)PetView.reload(context);});return updated;}
  public void searchFiles(String query){touch();execute(()->{try{if(!paired())throw new Exception("請先配對電腦。");files=request(base,"/v1/files?q="+URLEncoder.encode(query,"UTF-8"),null,token).getJSONArray("files");StringBuilder s=new StringBuilder("找到的共享檔案：\n");for(int i=0;i<files.length();i++)s.append(i+1).append(". ").append(files.getString(i)).append('\n');if(files.length()==0)s.append("沒有符合的檔案。");else s.append("\n說「使用檔案 1」選好後，再輸入問題。");say(s.toString(),false);}catch(Exception e){say(e.getMessage(),false);}});}
  public void revoke(){execute(()->{try{if(paired())request(base,"/v1/revoke",new JSONObject(),token);token="";base="";generatedImage=null;job="";pending=null;busy=false;online=false;deviceId="";files=new JSONArray();outbound.clear();notices.clear();store.put("connection",null);savePending();connection="尚未配對";say("手機配對已解除。",false);}catch(Exception e){say("解除配對未完成："+e.getMessage()+"。也可以在電腦說「解除手機配對」。",false);}});}
  public void location(double lat,double lon,float accuracy){execute(()->{try{request(base,"/v1/location",new JSONObject().put("latitude",lat).put("longitude",lon).put("accuracy",accuracy),token);say("已更新目前位置，只在電腦記憶體短暫保留。可以問我天氣了。",false);}catch(Exception e){say("位置未傳送："+e.getMessage(),false);}});}
  public void notification(String id,String app){execute(()->{if(!paired()||closed)return;try{if(outbound.size()>=30)outbound.removeFirst();outbound.add(new JSONObject().put("id",id).put("app",app).put("queuedAt",System.currentTimeMillis()));}catch(Exception ignored){}});}
  private void tick(){
    if(closed)return;long now=System.currentTimeMillis();String notice=notices.take(now,busy||now-lastTouch<30000);if(notice!=null)say(notice,false);
    if(!paired()||now<nextAttempt)return;
    boolean jobRequest=false;
    try{
      if(now-lastSession>=30000){JSONObject session=request(base,"/v1/session",new JSONObject().put("active",lastTouch>sentTouch),token);sentTouch=lastTouch;lastSession=now;connection="已連線 · "+session.optString("state","ACTIVE");}
      if(pending!=null){
        jobRequest=true;
        if(job.isEmpty()){JSONObject started=request(base,"/v1/jobs",pending,token);job=started.getString("id");savePending();}
        JSONObject result=request(base,"/v1/jobs/"+job,null,token);String state=result.getString("state");String partial=result.optString("text");if(!partial.isEmpty())say(partial,false);
        if(!state.equals("running")){JSONObject picture=result.optJSONObject("image");if(picture!=null)downloadGenerated(picture);pending=null;job="";busy=false;savePending();if(state.equals("error"))say("這次沒有完成："+result.optString("error"),false);else{JSONArray sources=result.optJSONArray("sources");if(sources!=null&&sources.length()>0){StringBuilder s=new StringBuilder(partial+"\n\n來源：");for(int i=0;i<Math.min(5,sources.length());i++)s.append('\n').append(sources.getJSONObject(i).optString("url"));partial=s.toString();}say(partial,true);}}
      }
      jobRequest=false;
      if(now-lastEvents>=15000){JSONObject events=request(base,"/v1/events?after="+cursor+"&reminderAfter="+context.getSharedPreferences("pet",0).getLong("reminder-"+deviceId,0),null,token);long next=events.getLong("cursor");if(next<cursor){cursor=0;events=request(base,"/v1/events?after=0",null,token);next=events.getLong("cursor");}JSONArray list=events.getJSONArray("events");for(int i=0;i<list.length();i++){JSONObject e=list.getJSONObject(i);notices.add(e.optString("source")+":"+e.getLong("seq"),(e.optString("source").equals("pc")?"電腦的":"手機的")+e.getString("app"),now);}JSONArray reminders=events.optJSONArray("reminders");if(reminders!=null)for(int ri=0;ri<reminders.length();ri++){JSONObject reminder=reminders.getJSONObject(ri);showReminder(reminder.getString("text"),reminder.getInt("seq"));context.getSharedPreferences("pet",0).edit().putLong("reminder-"+deviceId,reminder.getLong("seq")).apply();}cursor=next;lastEvents=now;saveConnection();}
      if(!outbound.isEmpty()){JSONObject n=outbound.peek();if(now-n.optLong("queuedAt")<120000){JSONObject payload=new JSONObject().put("id",n.getString("id")).put("app",n.getString("app"));request(base,"/v1/notification",payload,token);}outbound.removeFirst();}
      if(!busy&&now-lastAppearance>=60000){try{if(checkAppearance())connection="已連線 · 寵物外觀已更新";}catch(Exception e){if(e instanceof ApiError&&((ApiError)e).status==401)throw e;connection="已連線 · 外觀更新失敗，原外觀保留";}}
      online=true;failures=0;changed();
    }catch(Exception e){online=false;connection="連線中斷，稍後重試";nextAttempt=now+Math.min(60000,5000L*(1L<<Math.min(4,failures++)));
      if(e instanceof ApiError){Policies.FailureAction action=Policies.failureAction(jobRequest,((ApiError)e).status);
        if(action==Policies.FailureAction.EXPIRE_PAIRING){connection="配對已失效，請重新配對";token="";outbound.clear();notices.clear();files=new JSONArray();try{store.put("connection",null);}catch(Exception ignored){}}
        if(action==Policies.FailureAction.EXPIRE_PAIRING||action==Policies.FailureAction.FAIL_JOB){pending=null;job="";busy=false;try{savePending();}catch(Exception ignored){}say(e.getMessage(),false);}}
      changed();
    }
  }
  private void showReminder(String message,int id){
    android.app.NotificationManager manager=(android.app.NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
    if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new android.app.NotificationChannel("assistant-reminders","助理行程提醒",android.app.NotificationManager.IMPORTANCE_DEFAULT));
    android.app.Notification.Builder builder=Build.VERSION.SDK_INT>=26?new android.app.Notification.Builder(context,"assistant-reminders"):new android.app.Notification.Builder(context);
    manager.notify("assistant-reminder",id,builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("露米助理提醒").setContentText(message).setStyle(new android.app.Notification.BigTextStyle().bigText(message)).setAutoCancel(true).build());
  }
  public synchronized void close(){if(closed)return;closed=true;main.removeCallbacksAndMessages(null);worker.execute(()->{try{if(paired())request(base,"/v1/session",new JSONObject().put("connected",false),token);}catch(Exception ignored){}worker.shutdown();});}
  private void downloadGenerated(JSONObject picture)throws Exception {
    String route=picture.getString("url");if(!route.matches("/v1/jobs/[a-f0-9-]{36}/image"))throw new IOException("圖片網址格式錯誤。");
    HttpsURLConnection c=(HttpsURLConnection)new URL(base+route).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);c.setRequestProperty("Authorization","Bearer "+token);
    File temp=new File(context.getCacheDir(),"generated-download.tmp");
    try{int status=c.getResponseCode();if(status!=200)throw new ApiError(status,"圖片下載未完成（HTTP "+status+"）。");int total=0;try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(temp)){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){total+=n;if(total>16*1024*1024)throw new IOException("圖片超過 16 MB。");out.write(b,0,n);}}
      android.graphics.BitmapFactory.Options o=new android.graphics.BitmapFactory.Options();o.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(temp.getPath(),o);if(o.outWidth<1||o.outHeight<1||(long)o.outWidth*o.outHeight>16000000)throw new IOException("圖片尺寸不受支援。");
      File dest=new File(context.getCacheDir(),"generated-"+route.split("/")[3]+".png");if(!temp.renameTo(dest))throw new IOException("無法保存圖片。");generatedImage=dest;
      File[] old=context.getCacheDir().listFiles((d,n)->n.startsWith("generated-")&&n.endsWith(".png"));if(old!=null)for(File f:old)if(!f.equals(dest))f.delete();
    }finally{c.disconnect();temp.delete();}
  }
  static final class ApiError extends IOException{final int status;ApiError(int status,String message){super(message);this.status=status;}}
  private JSONObject request(String endpoint,String route,JSONObject body,String credential)throws Exception {
    if(endpoint.isEmpty())throw new IOException("尚未配對。");
    HttpsURLConnection c=(HttpsURLConnection)new URL(endpoint+route).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setRequestProperty("Accept","application/json");if(!credential.isEmpty())c.setRequestProperty("Authorization","Bearer "+credential);
    try{if(body!=null){byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}}
      int status=c.getResponseCode();if(status>=300&&status<400)throw new IOException("網址要求重新導向，請使用電腦顯示的 HTTPS 網址。");InputStream input=status>=400?c.getErrorStream():c.getInputStream();if(input==null)throw new ApiError(status,"伺服器未提供回應。");ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=input){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>450000)throw new IOException("回覆超過上限。");}}
      JSONObject value;try{value=new JSONObject(bytes.toString("UTF-8"));}catch(JSONException e){throw new IOException("Cloudflare 尚未連上電腦，或網址已變更。");}
      if(status>=400)throw new ApiError(status,value.optString("error","HTTP "+status));return value;
    }finally{c.disconnect();}
  }
}
