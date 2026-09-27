package tw.dailyagent.pet;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.location.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import android.util.Base64;
import java.io.*;
import java.util.regex.*;
public final class PetActivity extends Activity {
  static PetActivity visible;
  static String pendingAction;
  private BubbleView bubble;private PetView pet;
  private String image,file;
  private boolean pairPrompted=false,overlayRequested=false;
  private float petScale=1;
  private final Handler main=new Handler(Looper.getMainLooper());
  private AlertDialog pairing;
  private LocationListener locationListener;
  private String locationQuestion;
  private Runnable locationTimeout;
  private File savingImage;
  static final String HELP="你可以直接聊天，運算都在電腦。\n\n配對：連線 HTTPS網址 八位碼\n更換網址：重新配對\n重新連線\n同步寵物外觀\n圖片：傳圖片（也可從相簿分享給我）\n檔案：搜尋電腦檔案 關鍵字 → 使用檔案 1 → 提問\n清除附件\n開啟／關閉桌寵懸浮\n開啟／關閉通知偵測\n更新手機位置 → 今天天氣？\n查看歷史對話\n查看連線\n解除配對\n關閉桌寵\n\n通知預設只看 App 來源，不讀私訊內容。電腦也需開啟通知提醒與 Windows 授權。臨時 Cloudflare 網址變更時，重新配對即可。";
  private AgentClient client(){return PetService.current==null?null:PetService.current.client;}
  @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().setBackgroundDrawableResource(android.R.color.transparent);getWindow().setDimAmount(0);getWindow().addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);getWindow().setGravity(Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);
    LinearLayout layout=new LinearLayout(this){@Override protected void onMeasure(int w,int h){int available=View.MeasureSpec.getSize(h);if(pet!=null&&bubble!=null&&available>0){int desired=(int)(dp(152)*petScale),height=Math.min(desired,Math.max(dp(72),available/3));android.view.ViewGroup.LayoutParams p=pet.getLayoutParams();p.height=height;p.width=height*132/152;bubble.maxTextHeight=Math.max(dp(64),Math.min(dp(320),available-height-dp(140)));}super.onMeasure(w,h);}};layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(dp(12),dp(12),dp(12),dp(18));
    bubble=new BubbleView(this,this::send);layout.addView(bubble,new LinearLayout.LayoutParams(-1,-2));pet=new PetView(this);LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(dp(132),dp(152));size.gravity=Gravity.RIGHT;layout.addView(pet,size);pet.setOnClickListener(v->{pet.playGesture("waving");if(bubble.getVisibility()!=View.VISIBLE&&client()!=null)client().openFreshBubble();bubble.reopen();bubble.input.requestFocus();getSystemService(android.view.inputmethod.InputMethodManager.class).showSoftInput(bubble.input,0);});pet.setOnLongClickListener(v->{startActivity(new Intent(this,SettingsActivity.class));return true;});setContentView(layout);getWindow().setLayout(Math.min(getResources().getDisplayMetrics().widthPixels,dp(420)),WindowManager.LayoutParams.WRAP_CONTENT);
    if(client()!=null)client().openFreshBubble();startForegroundService(new Intent(this,PetService.class));handleShare(getIntent());
    petScale=Policies.petScale(getSharedPreferences("pet",0).getFloat("scale",1));resizePet();pet.setOnTouchListener(new PetGestures(pet,new PetGestures.Actions(){public void tap(){pet.performClick();}public void hold(){pet.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);pet.performLongClick();}public void drag(float x,float y){}public void scale(float factor){petScale=Policies.petScale(petScale*factor);resizePet();}public void end(){getSharedPreferences("pet",0).edit().putFloat("scale",petScale).apply();}}));
  }
  @Override protected void onResume(){super.onResume();visible=this;petScale=Policies.petScale(getSharedPreferences("pet",0).getFloat("scale",1));resizePet();if(PetService.current!=null){PetService.current.client.touch();PetService.current.refresh();}else main.postDelayed(this::render,200);if(overlayRequested&&Settings.canDrawOverlays(this)){overlayRequested=false;getSharedPreferences("pet",0).edit().putBoolean("overlay",true).apply();if(client()!=null)client().say("懸浮桌寵已開啟，返回手機桌面就能看到我。",false);}if(pendingAction!=null){String action=pendingAction;pendingAction=null;main.postDelayed(()->send(action),250);}}
  @Override protected void onPause(){visible=null;super.onPause();if(PetService.current!=null)PetService.current.refresh();if(locationListener!=null)locationFailed("定位已暫停，問題已保留，回來後可重新送出。");}
  @Override protected void onDestroy(){main.removeCallbacksAndMessages(null);if(pairing!=null)pairing.dismiss();super.onDestroy();}
  @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleShare(intent);}
  private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
  private void resizePet(){android.view.ViewGroup.LayoutParams p=pet.getLayoutParams();p.width=(int)(dp(132)*petScale);p.height=(int)(dp(152)*petScale);pet.setLayoutParams(p);}
  public void render(){if(visible!=this||isFinishing()||isDestroyed())return;AgentClient c=client();if(c==null){main.postDelayed(this::render,250);return;}bubble.setHistoryMode(c.historyMode);bubble.setGeneratedImage(c.generatedImage);bubble.render(c.historyMode&&!c.history.isEmpty()?c.history:c.text,c.connection+(image!=null?" · 已附圖片":file!=null?" · 已附文件":""));pet.setBusy(c.busy);pet.react(c.text);if(c.initialized&&!c.paired()&&!c.pairing&&!pairPrompted){pairPrompted=true;showPairing();}}
  private void showPairing(){if(isFinishing()||(pairing!=null&&pairing.isShowing()))return;LinearLayout form=new LinearLayout(this);form.setPadding(dp(24),dp(8),dp(24),dp(8));form.setOrientation(LinearLayout.VERTICAL);
    TextView instructions=new TextView(this);instructions.setText("先在電腦桌寵說「開啟 Cloudflare 連線」，再說「開啟手機配對」。\n\n模型都在電腦，手機只負責連線與顯示。");instructions.setPadding(0,0,0,dp(14));form.addView(instructions);
    EditText url=new EditText(this);url.setHint("https://…trycloudflare.com");url.setSingleLine(true);url.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);form.addView(url);
    EditText code=new EditText(this);code.setHint("八位配對碼");code.setSingleLine(true);code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);code.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(8)});form.addView(code);
    pairing=new AlertDialog.Builder(this).setTitle("先連上你的電腦").setView(form).setPositiveButton("配對",null).setNegativeButton("稍後",(d,w)->{if(client()!=null)client().say("準備好後說「配對」，就能重新開啟配對畫面。",false);}).create();pairing.setOnShowListener(d->pairing.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{String endpoint=Policies.server(url.getText().toString());String pin=code.getText().toString();if(!pin.matches("[0-9]{8}"))throw new Exception("請輸入八位配對碼。");if(client()!=null){client().pair(endpoint,pin);client().say("正在配對電腦…",false);pairing.dismiss();}}catch(Exception e){code.setError(e.getMessage());}}));pairing.show();
  }
  private void send(String text){AgentClient c=client();if(c==null)return;c.touch();String s=text.trim().replaceAll("[。！？!?]$","");Matcher pair=Pattern.compile("^連線\\s+(https://\\S+)\\s+(?:配對(?:碼)?\\s*)?([0-9]{8})$").matcher(s);
    if(pair.matches()){c.pair(pair.group(1),pair.group(2));return;}
    if(s.equals("配對")||s.equals("重新配對")){showPairing();return;}
    if(s.equals("重新連線")){c.reconnect();return;}
    if(s.equals("同步寵物外觀")||s.equals("更新寵物外觀")){c.syncAppearance();return;}
    if(s.equals("使用說明")){c.say(HELP,false);return;}
    if(s.equals("設定")){startActivity(new Intent(this,SettingsActivity.class));return;}
    if(s.equals("查看連線")){c.say(c.connection+"。模型與記憶宮殿都在電腦；手機不載入模型。",false);return;}
    if(s.equals("查看歷史對話")||s.equals("開啟歷史紀錄")||s.equals("開啟歷史紀錄模式")){c.setHistoryMode(true);bubble.reopen();return;}
    if(s.equals("關閉歷史紀錄")||s.equals("關閉歷史紀錄模式")){c.setHistoryMode(false);bubble.reopen();return;}
    if(s.equals("傳圖片")||s.equals("看圖片")||s.equals("選圖片")){pickImage();return;}
    if(s.startsWith("搜尋電腦檔案")){c.searchFiles(s.substring(6).trim());return;}
    if(s.matches("使用檔案\\s*[0-9]+")){try{int index=Integer.parseInt(s.replaceAll("\\D", ""))-1;file=c.files.getString(index);image=null;c.say("已選取："+file+"\n接著直接輸入問題。",false);}catch(Exception e){c.say("請先搜尋電腦檔案，再使用列表中的編號。",false);}return;}
    if(s.equals("清除附件")){image=null;file=null;c.say("附件已清除。",false);return;}
    if(s.equals("開啟桌寵懸浮")){if(!Settings.canDrawOverlays(this)){overlayRequested=true;startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));}else{getSharedPreferences("pet",0).edit().putBoolean("overlay",true).apply();c.say("懸浮桌寵已開啟，返回手機桌面就能看到我。",false);}return;}
    if(s.equals("關閉桌寵懸浮")){getSharedPreferences("pet",0).edit().putBoolean("overlay",false).apply();c.say("懸浮已關閉，這個聊天泡泡仍可使用。",false);return;}
    if(s.equals("開啟通知偵測")){getSharedPreferences("pet",0).edit().putBoolean("notifications",true).apply();c.say("請在 Android 系統頁面允許日常桌寵存取通知。我只讀 App 來源，過濾常駐與重複通知，不讀私訊內文。",false);startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));return;}
    if(s.equals("關閉通知偵測")){getSharedPreferences("pet",0).edit().putBoolean("notifications",false).apply();c.say("手機通知偵測已關閉。",false);return;}
    if(s.equals("更新手機位置")||s.equals("開啟定位")){requestLocation();return;}
    if(s.equals("解除配對")){c.revoke();return;}
    if(s.equals("關閉桌寵")){stopService(new Intent(this,PetService.class));finishAndRemoveTask();return;}
    if(s.equals("儲存圖片")||s.equals("保存圖片")){saveGenerated();return;}
    if(locationQuestion!=null){bubble.input.setText(text);return;}
    if(c.busy||c.pairing){bubble.input.setText(text);return;}if(!c.paired()){bubble.input.setText(text);showPairing();return;}if(image==null&&file==null&&Policies.needsLocation(text)){locationQuestion=text;requestLocation();return;}submitQuestion(text,null);
  }
  private void submitQuestion(String text,org.json.JSONObject location){AgentClient c=client();if(c!=null&&c.submit(text,image,file,location)){image=null;file=null;}else bubble.input.setText(text);}
  private void saveGenerated(){AgentClient c=client();if(c==null||c.generatedImage==null){if(c!=null)c.say("目前沒有可儲存的生成圖片。",false);return;}savingImage=c.generatedImage;startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("image/png").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,savingImage.getName()),13);}
  private void pickImage(){try{Intent pick=Build.VERSION.SDK_INT>=33?new Intent("android.provider.action.PICK_IMAGES").setType("image/*"):new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(pick,11);}catch(Exception e){client().say("無法開啟相簿，請從相簿分享圖片給日常桌寵。",false);}}
  @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==11&&result==RESULT_OK&&data!=null)loadImage(data.getData());if(request==13&&result==RESULT_OK&&data!=null&&savingImage!=null){File source=savingImage;Uri destination=data.getData();AgentClient c=client();if(c!=null)c.execute(()->{try(InputStream in=new FileInputStream(source);OutputStream out=getContentResolver().openOutputStream(destination)){if(out==null)throw new IOException("無法開啟儲存位置");byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);c.say("圖片已儲存。",false);}catch(Exception e){c.say("儲存失敗："+e.getMessage(),false);}});}}
  private void handleShare(Intent intent){if(Intent.ACTION_SEND.equals(intent.getAction())&&intent.getType()!=null&&intent.getType().startsWith("image/")){Uri uri=intent.getParcelableExtra(Intent.EXTRA_STREAM);if(uri!=null)main.postDelayed(()->loadImage(uri),300);intent.setAction(Intent.ACTION_MAIN);}}
  private void loadImage(Uri uri){AgentClient c=client();if(uri==null||c==null)return;c.execute(()->{try{
    ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("圖片無法開啟。");byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>20*1024*1024)throw new IOException("原圖超過 20 MB，請縮小後再傳。");}}
    byte[] raw=bytes.toByteArray();BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(raw,0,raw.length,options);if(options.outWidth<1||options.outHeight<1||(long)options.outWidth*options.outHeight>100000000L)throw new IOException("圖片格式不支援或尺寸過大。");options.inSampleSize=1;while(Math.max(options.outWidth,options.outHeight)/options.inSampleSize>1600)options.inSampleSize*=2;options.inJustDecodeBounds=false;Bitmap bitmap=BitmapFactory.decodeByteArray(raw,0,raw.length,options);if(bitmap==null)throw new IOException("無法解碼图片。");bitmap=ImageOrientation.upright(bitmap,raw);ByteArrayOutputStream jpeg=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,85,jpeg);bitmap.recycle();if(jpeg.size()>2*1024*1024)throw new IOException("圖片壓縮後仍過大。");String encoded=Base64.encodeToString(jpeg.toByteArray(),Base64.NO_WRAP);main.post(()->{image=encoded;file=null;c.say("圖片準備好了，輸入想問的問題。",false);});
  }catch(Exception e){c.say("圖片未加入："+e.getMessage(),false);}});}
  private void requestLocation(){
    if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},12);return;}
    stopLocation();LocationManager lm=getSystemService(LocationManager.class);
    try{
      locationListener=new LocationListener(){public void onLocationChanged(Location location){
        if(location.getElapsedRealtimeNanos()>0&&(SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos())>120000000000L)return;
        String question=locationQuestion;locationQuestion=null;stopLocation();AgentClient c=client();if(c==null)return;
        if(question==null)c.location(location.getLatitude(),location.getLongitude(),location.getAccuracy());
        else try{org.json.JSONObject value=new org.json.JSONObject().put("latitude",Math.round(location.getLatitude()*10)/10.0).put("longitude",Math.round(location.getLongitude()*10)/10.0).put("captured_at",System.currentTimeMillis());submitQuestion(question,value);}catch(Exception e){bubble.input.setText(question);c.say("定位資料無法傳送，請重試。",false);}
      }public void onStatusChanged(String p,int state,Bundle b){}public void onProviderEnabled(String p){}public void onProviderDisabled(String p){}};
      boolean started=false;
      for(String provider:new String[]{LocationManager.NETWORK_PROVIDER,LocationManager.GPS_PROVIDER})if(lm.isProviderEnabled(provider)){try{lm.requestSingleUpdate(provider,locationListener,Looper.getMainLooper());started=true;}catch(SecurityException ignored){}}
      if(!started)throw new IOException("請開啟手機定位並允許位置權限。");
      if(client()!=null)client().say("正在取得手機位置…",false);
      locationTimeout=()->locationFailed("暫時取不到手機位置，請確認定位已開啟後重送問題。");main.postDelayed(locationTimeout,20000);
    }catch(Exception e){locationFailed("定位沒有完成："+e.getMessage());}
  }
  private void locationFailed(String message){stopLocation();if(locationQuestion!=null){bubble.input.setText(locationQuestion);locationQuestion=null;}if(client()!=null)client().say(message,false);}
  private void stopLocation(){if(locationTimeout!=null){main.removeCallbacks(locationTimeout);locationTimeout=null;}if(locationListener!=null){getSystemService(LocationManager.class).removeUpdates(locationListener);locationListener=null;}}
  @Override public void onRequestPermissionsResult(int r,String[] permissions,int[] results){super.onRequestPermissionsResult(r,permissions,results);if(r==12){if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED)requestLocation();else locationFailed("沒有位置權限，問題已保留；不會改用電腦位置。");}}
}
