package tw.dailyagent.pet;
import android.os.Handler;
import android.os.Looper;
import android.view.*;
/** One gesture owns the whole pointer sequence; pinch never becomes a click or hold. */
public final class PetGestures implements View.OnTouchListener {
  public interface Actions{void tap();void hold();void drag(float dx,float dy);void scale(float factor);void end();}
  private final Handler main=new Handler(Looper.getMainLooper());
  private final ScaleGestureDetector scaler;
  private final Actions actions;
  private final int slop;
  private float x,y;private final Policies.TouchIntent state=new Policies.TouchIntent();
  private final Runnable hold=this::fireHold;
  private void fireHold(){if(state.hold())actions.hold();}
  public PetGestures(View view,Actions actions){this.actions=actions;slop=ViewConfiguration.get(view.getContext()).getScaledTouchSlop();scaler=new ScaleGestureDetector(view.getContext(),new ScaleGestureDetector.SimpleOnScaleGestureListener(){@Override public boolean onScaleBegin(ScaleGestureDetector d){state.multiplePointers();main.removeCallbacks(hold);return true;}@Override public boolean onScale(ScaleGestureDetector d){actions.scale(d.getScaleFactor());return true;}});view.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener(){public void onViewAttachedToWindow(View v){}public void onViewDetachedFromWindow(View v){state.end(true);main.removeCallbacks(hold);}});}
  @Override public boolean onTouch(View view,MotionEvent e){
    if(e.getActionMasked()==MotionEvent.ACTION_DOWN){state.begin();x=e.getRawX();y=e.getRawY();main.postDelayed(hold,ViewConfiguration.getLongPressTimeout());}
    if(e.getPointerCount()>1){state.multiplePointers();main.removeCallbacks(hold);}
    scaler.onTouchEvent(e);
    if(e.getActionMasked()==MotionEvent.ACTION_MOVE&&!state.pinched&&!state.held){float dx=e.getRawX()-x,dy=e.getRawY()-y;state.move((float)Math.hypot(dx,dy),slop);if(state.dragged){main.removeCallbacks(hold);actions.drag(dx,dy);x=e.getRawX();y=e.getRawY();}}
    if(e.getActionMasked()==MotionEvent.ACTION_UP||e.getActionMasked()==MotionEvent.ACTION_CANCEL){main.removeCallbacks(hold);boolean tap=state.end(e.getActionMasked()==MotionEvent.ACTION_CANCEL);actions.end();if(tap)actions.tap();}
    return true;
  }
}
