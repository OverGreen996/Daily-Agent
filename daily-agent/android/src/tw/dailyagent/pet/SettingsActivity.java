package tw.dailyagent.pet;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
public final class SettingsActivity extends Activity {
  private LinearLayout column;
  @Override public void onCreate(Bundle state){super.onCreate(state);ScrollView scroll=new ScrollView(this);column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setPadding(dp(24),dp(48),dp(24),dp(32));column.setBackgroundColor(0xFFF7FAF8);scroll.addView(column);setContentView(scroll);}
  @Override protected void onResume(){super.onResume();PetService.settingsVisible=true;if(PetService.current!=null)PetService.current.refresh();build();}
  @Override protected void onPause(){PetService.settingsVisible=false;super.onPause();if(PetService.current!=null)PetService.current.refresh();}
  private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
  private void label(String text,int size){TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setTextColor(0xFF28473F);v.setPadding(0,dp(8),0,dp(16));column.addView(v);}
  private void action(String text,Runnable run){Button button=new Button(this);button.setAllCaps(false);button.setText(text);button.setOnClickListener(v->run.run());column.addView(button,new LinearLayout.LayoutParams(-1,-2));}
  private void command(String text){PetActivity.pendingAction=text;startActivity(new Intent(this,PetActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));finish();}
  private void build(){column.removeAllViews();label("桌寵設定",26);label(PetService.current==null?"桌寵已關閉":PetService.current.client.connection,14);
    label("原地長按開設定 · 點一下展開聊天，再點一下收合 · 拖曳移動\n手機不安裝模型，所有 AI 運算都交給電腦。",14);
    float scale=Policies.petScale(getSharedPreferences("pet",0).getFloat("scale",1));
    TextView sizeLabel=new TextView(this);sizeLabel.setTextSize(16);sizeLabel.setTextColor(0xFF28473F);sizeLabel.setText("寵物大小："+Math.round(scale*100)+"%");column.addView(sizeLabel);
    PetView preview=new PetView(this);LinearLayout.LayoutParams previewSize=new LinearLayout.LayoutParams(dp(112)*Math.round(scale*100)/100,dp(138)*Math.round(scale*100)/100);previewSize.gravity=Gravity.CENTER_HORIZONTAL;column.addView(preview,previewSize);
    SeekBar sizeSlider=new SeekBar(this);sizeSlider.setMax(160);sizeSlider.setProgress(Math.round(scale*100)-40);sizeSlider.setContentDescription("寵物大小，40% 到 200%");column.addView(sizeSlider,new LinearLayout.LayoutParams(-1,dp(48)));
    sizeSlider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
      public void onProgressChanged(SeekBar bar,int progress,boolean user){float value=Policies.petScale((progress+40)/100f);sizeLabel.setText("寵物大小："+Math.round(value*100)+"%");ViewGroup.LayoutParams p=preview.getLayoutParams();p.width=Math.round(dp(112)*value);p.height=Math.round(dp(138)*value);preview.setLayoutParams(p);getSharedPreferences("pet",0).edit().putFloat("scale",value).apply();}
      public void onStartTrackingTouch(SeekBar bar){}
      public void onStopTrackingTouch(SeekBar bar){}
    });
    action("恢復預設大小",()->sizeSlider.setProgress(60));
    label("寵物外觀："+getSharedPreferences("pet",0).getString("petName","露米")+"\n可在電腦更換外觀後，按「傳送外觀到手機」。",14);
    action("配對／更換電腦網址",()->command("重新配對"));
    action("重新連線",()->command("重新連線"));action("同步寵物外觀",()->command("同步寵物外觀"));
    boolean overlay=getSharedPreferences("pet",0).getBoolean("overlay",false)&&Settings.canDrawOverlays(this);action(overlay?"關閉桌寵懸浮":"開啟桌寵懸浮",()->command(overlay?"關閉桌寵懸浮":"開啟桌寵懸浮"));
    boolean enabled=getSharedPreferences("pet",0).getBoolean("notifications",false);String access=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");boolean granted=access!=null&&access.contains(getPackageName()+"/");
    label("手機通知："+(enabled&&granted?"觀察中；只有 App 名稱":enabled?"等待 Android 授權":"已關閉")+"\n普通通知合併成安靜泡泡，過濾重複、常駐與桌寵自己的通知。電腦通知需另外在 PC 授權。",14);
    action(enabled&&granted?"關閉通知偵測":"開啟通知偵測／授權",()->command(enabled&&granted?"關閉通知偵測":"開啟通知偵測"));
    label("助理提醒：電腦需保持運行，手機需允許系統通知。提醒只出現在通知列，不會自動展開聊天。",14);
    action("助理提醒通知授權",()->{if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},20);else startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));});
    action("助理功能與指令",()->command("助理說明"));action("今天摘要",()->command("今天摘要"));action("查看待辦",()->command("查看待辦"));
    action("更新手機位置",()->command("更新手機位置"));action("查看歷史對話",()->command("查看歷史對話"));action("使用說明",()->command("使用說明"));action("解除配對",()->new AlertDialog.Builder(this).setMessage("解除這支手機的配對？電腦的記憶宮殿會保留。").setPositiveButton("解除",(d,w)->command("解除配對")).setNegativeButton("取消",null).show());
    action("返回聊天",()->command("查看連線"));action("關閉桌寵",()->{PetService.closePet(this);finishAndRemoveTask();});
  }
}
