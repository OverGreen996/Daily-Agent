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
    label("原地長按開設定 · 輕點聊天 · 拖曳移動 · 雙指縮放\n手機不安裝模型，所有 AI 運算都交給電腦。",14);
    label("寵物外觀："+getSharedPreferences("pet",0).getString("petName","露米")+"\n可在電腦更換外觀後，按「傳送外觀到手機」。",14);
    action("配對／更換電腦網址",()->command("重新配對"));
    action("重新連線",()->command("重新連線"));action("同步寵物外觀",()->command("同步寵物外觀"));
    boolean overlay=getSharedPreferences("pet",0).getBoolean("overlay",false)&&Settings.canDrawOverlays(this);action(overlay?"關閉桌寵懸浮":"開啟桌寵懸浮",()->command(overlay?"關閉桌寵懸浮":"開啟桌寵懸浮"));
    boolean enabled=getSharedPreferences("pet",0).getBoolean("notifications",false);String access=Settings.Secure.getString(getContentResolver(),"enabled_notification_listeners");boolean granted=access!=null&&access.contains(getPackageName()+"/");
    label("手機通知："+(enabled&&granted?"觀察中；只有 App 名稱":enabled?"等待 Android 授權":"已關閉")+"\n普通通知合併成安靜泡泡，過濾重複、常駐與桌寵自己的通知。電腦通知需另外在 PC 授權。",14);
    action(enabled&&granted?"關閉通知偵測":"開啟通知偵測／授權",()->command(enabled&&granted?"關閉通知偵測":"開啟通知偵測"));
    action("更新手機位置",()->command("更新手機位置"));action("查看歷史對話",()->command("查看歷史對話"));action("使用說明",()->command("使用說明"));action("解除配對",()->new AlertDialog.Builder(this).setMessage("解除這支手機的配對？電腦的記憶宮殿會保留。").setPositiveButton("解除",(d,w)->command("解除配對")).setNegativeButton("取消",null).show());
    action("返回聊天",()->command("查看連線"));action("關閉桌寵",()->{stopService(new Intent(this,PetService.class));finishAndRemoveTask();});
  }
}
