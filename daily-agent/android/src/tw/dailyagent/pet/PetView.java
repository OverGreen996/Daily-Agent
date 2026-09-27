package tw.dailyagent.pet;
import android.content.Context;
import android.graphics.*;
import android.os.SystemClock;
import android.view.View;
public final class PetView extends View {
  private static Bitmap atlas;
  private static boolean animated=true;
  public static void reload(Context c){Bitmap next=null;try{android.util.AtomicFile profile=new android.util.AtomicFile(new java.io.File(c.getFilesDir(),"pet-profile.json"));if(profile.getBaseFile().exists()){org.json.JSONObject meta=new org.json.JSONObject(new String(profile.readFully(),java.nio.charset.StandardCharsets.UTF_8));String name=meta.getString("file");if(!name.matches("pet-[a-f0-9]{64}\\.png"))throw new java.io.IOException("Invalid profile");next=BitmapFactory.decodeFile(new java.io.File(c.getFilesDir(),name).getPath());if(next!=null)animated=meta.getBoolean("animated");}}catch(Exception ignored){}if(next==null&&atlas!=null)return;if(next==null){try{BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=2;next=BitmapFactory.decodeStream(c.getAssets().open("lumi.webp"),null,options);animated=true;}catch(Exception ignored){}}if(next!=null){Bitmap old=atlas;atlas=next;if(old!=null)old.recycle();}}
  private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
  private int frame=0,row=0;
  private boolean busy=false,moving=false;
  private String gesture="",lastAmbient="",lastReaction="";
  private long gestureUntil=0,nextAmbient=0;
  private final Runnable animate=new Runnable(){public void run(){if(getWindowVisibility()!=VISIBLE)return;boolean awake=getContext().getSystemService(android.os.PowerManager.class).isInteractive();long now=SystemClock.uptimeMillis();if(isShown()&&awake&&animated){
      int next=0;
      if(busy)next=PetAnimationRules.row("thinking");
      else if(moving)next=row;
      else if(!gesture.isEmpty()&&now<gestureUntil)next=PetAnimationRules.row(gesture);
      else {gesture="";if(nextAmbient==0)nextAmbient=now+12000;if(now>=nextAmbient){gesture=PetAnimationRules.nextAmbient(lastAmbient);lastAmbient=gesture;gestureUntil=now+PetAnimationRules.gestureDuration(gesture);nextAmbient=gestureUntil+8000+(long)(Math.random()*7000);next=PetAnimationRules.row(gesture);}}
      if(next!=row){row=next;frame=0;}else frame=(frame+1)%PetAnimationRules.COUNTS[row];invalidate();
    }postDelayed(this,awake?PetAnimationRules.interval(row):10000);}};
  public PetView(Context c){super(c);setContentDescription("桌寵，輕點聊天，原地長按設定，雙指縮放");if(atlas==null)reload(c);nextAmbient=SystemClock.uptimeMillis()+12000;}
  public void setBusy(boolean value){if(busy==value)return;busy=value;gesture="";moving=false;row=value?PetAnimationRules.row("thinking"):0;frame=0;nextAmbient=SystemClock.uptimeMillis()+(value?12000:5000);invalidate();}
  public void playGesture(String state){if(busy||!animated)return;int next=PetAnimationRules.row(state);if(next==0)return;gesture=state;moving=false;gestureUntil=SystemClock.uptimeMillis()+PetAnimationRules.gestureDuration(state);nextAmbient=gestureUntil+8000;row=next;frame=0;invalidate();}
  public void movement(float dx){if(busy||!animated||dx==0)return;int next=PetAnimationRules.row(dx>0?"running-right":"running-left");frame=PetAnimationRules.movementFrame(moving,row,next,frame);moving=true;gesture="";row=next;invalidate();}
  public void endMovement(){if(!moving)return;moving=false;row=busy?PetAnimationRules.row("thinking"):0;frame=0;nextAmbient=SystemClock.uptimeMillis()+5000;invalidate();}
  public void react(String text){String value=text==null?"":text;if(value.equals(lastReaction))return;lastReaction=value;if(value.matches("(?s).*(沒有完成|無法|失敗|錯誤|中斷).*"))playGesture("failed");else if(value.matches("(?s).*(提醒|警告|下雨|低電量).*"))playGesture("waiting");}
  @Override protected void onAttachedToWindow(){super.onAttachedToWindow();removeCallbacks(animate);post(animate);}
  @Override protected void onWindowVisibilityChanged(int visibility){super.onWindowVisibilityChanged(visibility);if(animate!=null){removeCallbacks(animate);if(visibility==VISIBLE)post(animate);}}
  @Override protected void onDetachedFromWindow(){removeCallbacks(animate);super.onDetachedFromWindow();}
  @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);if(atlas==null){paint.setColor(Color.rgb(86,151,143));canvas.drawCircle(getWidth()/2f,getHeight()/2f,Math.min(getWidth(),getHeight())/3f,paint);return;}int w=animated?atlas.getWidth()/8:atlas.getWidth(),h=animated?atlas.getHeight()/11:atlas.getHeight(),drawRow=animated?row:0,col=animated?frame%PetAnimationRules.COUNTS[drawRow]:0;float scale=Math.min((float)getWidth()/w,(float)getHeight()/h);float dw=w*scale,dh=h*scale;canvas.drawBitmap(atlas,new Rect(col*w,drawRow*h,(col+1)*w,(drawRow+1)*h),new RectF((getWidth()-dw)/2,(getHeight()-dh)/2,(getWidth()+dw)/2,(getHeight()+dh)/2),paint);}
}
