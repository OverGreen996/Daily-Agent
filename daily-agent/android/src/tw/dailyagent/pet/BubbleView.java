package tw.dailyagent.pet;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.*;
import android.view.inputmethod.EditorInfo;
import android.widget.*;
public final class BubbleView extends LinearLayout {
  public interface Send {void submit(String text);}
  public final EditText input;
  public int maxTextHeight;
  private final TextView content,status;
  private final ScrollView scroll;
  private final ImageView picture;
  private final Send sender;
  private java.io.File pictureFile;
  private android.graphics.Bitmap pictureBitmap;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private boolean historyMode=false,collapsed=false;
  private final Runnable expire=()->{if(!historyMode)setVisibility(GONE);};
  public void collapse(){collapsed=true;handler.removeCallbacks(expire);setVisibility(GONE);}
  public void reopen(){collapsed=false;setVisibility(VISIBLE);armExpiry();}
  private void armExpiry(){handler.removeCallbacks(expire);if(!historyMode)handler.postDelayed(expire,15*60*1000L);}
  public void setHistoryMode(boolean value){if(historyMode==value)return;historyMode=value;if(!collapsed)reopen();}
  private String target="";private int shown=0;
  private final Runnable typing=new Runnable(){public void run(){if(shown>=target.length())return;boolean bottom=scroll.getScrollY()+scroll.getHeight()>=scroll.getChildAt(0).getHeight()-dp(24);shown=Math.min(target.length(),shown+Math.max(5,(target.length()-shown)/18));if(shown<target.length()&&shown>0&&Character.isHighSurrogate(target.charAt(shown-1)))shown++;content.setText(target.substring(0,shown));if(bottom)scroll.post(()->scroll.fullScroll(View.FOCUS_DOWN));handler.postDelayed(this,20);}};
  public BubbleView(Context c,Send send){super(c);sender=send;setOrientation(VERTICAL);setPadding(dp(18),dp(14),dp(18),dp(14));setElevation(dp(8));GradientDrawable bg=new GradientDrawable();bg.setColor(Color.argb(239,252,252,249));bg.setCornerRadius(dp(24));bg.setStroke(dp(1),0xAAD9E5E1);setBackground(bg);
    status=new TextView(c);status.setTextSize(11);status.setTextColor(0xFF637B77);addView(status,new LayoutParams(-1,-2));
    maxTextHeight=dp(320);scroll=new ScrollView(c){@Override protected void onMeasure(int w,int h){int max=maxTextHeight;super.onMeasure(w,MeasureSpec.makeMeasureSpec(Math.min(max,MeasureSpec.getSize(h)>0?MeasureSpec.getSize(h):max),MeasureSpec.AT_MOST));}};scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(true);
    content=new TextView(c);content.setTextSize(17);content.setLineSpacing(dp(3),1.12f);content.setTextColor(0xFF243B37);content.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));content.setTextIsSelectable(true);content.setPadding(0,dp(10),0,dp(12));LinearLayout body=new LinearLayout(c);body.setOrientation(VERTICAL);body.addView(content,new LayoutParams(-1,-2));picture=new ImageView(c);picture.setAdjustViewBounds(true);picture.setMaxHeight(dp(240));picture.setScaleType(ImageView.ScaleType.FIT_CENTER);picture.setVisibility(GONE);picture.setContentDescription("生成圖片，點一下放大，長按儲存");body.addView(picture,new LayoutParams(-1,-2));scroll.addView(body,new ScrollView.LayoutParams(-1,-2));picture.setOnClickListener(v->{if(pictureFile!=null){if(sender!=null)GeneratedImageView.show(getContext(),pictureFile,()->sender.submit("儲存圖片"));else getContext().startActivity(new android.content.Intent(getContext(),PetActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));}});picture.setOnLongClickListener(v->{if(sender!=null)sender.submit("儲存圖片");return true;});addView(scroll,new LayoutParams(-1,-2));
    input=new EditText(c);input.setTextSize(16);input.setHint("想聊些什麼？");input.setSingleLine(true);input.setImeOptions(EditorInfo.IME_ACTION_SEND);input.setPadding(dp(10),dp(8),dp(10),dp(8));input.setTextColor(0xFF243B37);input.setHintTextColor(0xFF708480);
    GradientDrawable field=new GradientDrawable();field.setColor(0x887DABA0);field.setColor(0x187DABA0);field.setCornerRadius(dp(14));input.setBackground(field);addView(input,new LayoutParams(-1,-2));
    if(send==null)input.setVisibility(GONE);else input.setOnEditorActionListener((v,action,event)->{if(action==EditorInfo.IME_ACTION_SEND||(event!=null&&event.getKeyCode()==KeyEvent.KEYCODE_ENTER&&event.getAction()==KeyEvent.ACTION_DOWN)){String text=input.getText().toString().trim();if(!text.isEmpty()){input.setText("");send.submit(text);}return true;}return false;});
  }
  public void setGeneratedImage(java.io.File file){if(java.util.Objects.equals(file,pictureFile))return;pictureFile=file;picture.setImageDrawable(null);if(pictureBitmap!=null){pictureBitmap.recycle();pictureBitmap=null;}if(file!=null)pictureBitmap=GeneratedImageView.decode(file,640);picture.setImageBitmap(pictureBitmap);picture.setVisibility(pictureBitmap==null?GONE:VISIBLE);}
  private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
  public void render(String text,String connection){status.setText(connection);if(text.equals(target))return;if(!collapsed)reopen();handler.removeCallbacks(typing);if(!text.startsWith(target)){shown=0;content.setText("");scroll.scrollTo(0,0);}target=text;handler.post(typing);}
  @Override protected void onDetachedFromWindow(){handler.removeCallbacks(expire);handler.removeCallbacks(typing);super.onDetachedFromWindow();}
  @Override protected void onAttachedToWindow(){super.onAttachedToWindow();handler.removeCallbacks(typing);if(shown<target.length())handler.post(typing);}
}
