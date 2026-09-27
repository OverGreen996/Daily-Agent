package tw.dailyagent.pet;
import android.app.Dialog;
import android.content.Context;
import android.graphics.*;
import android.view.*;
import android.widget.ImageView;
import java.io.File;

/** Local image viewer. Drag to pan, pinch to zoom, Back to dismiss. */
public final class GeneratedImageView {
  private GeneratedImageView(){}
  public static Bitmap decode(File file,int max){
    BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.getPath(),o);
    if(o.outWidth<1||o.outHeight<1||(long)o.outWidth*o.outHeight>16000000)return null;
    o.inSampleSize=1;while(Math.max(o.outWidth,o.outHeight)/o.inSampleSize>max)o.inSampleSize*=2;
    o.inJustDecodeBounds=false;return BitmapFactory.decodeFile(file.getPath(),o);
  }
  public static void show(Context context,File file,Runnable save){
    Bitmap bitmap=decode(file,2048);if(bitmap==null)return;
    Dialog dialog=new Dialog(context,android.R.style.Theme_Material_NoActionBar_Fullscreen);
    ImageView view=new ImageView(context);view.setBackgroundColor(Color.BLACK);view.setImageBitmap(bitmap);view.setScaleType(ImageView.ScaleType.MATRIX);
    Matrix matrix=new Matrix();float[] state={1,1,0,0};
    ScaleGestureDetector zoom=new ScaleGestureDetector(context,new ScaleGestureDetector.SimpleOnScaleGestureListener(){@Override public boolean onScale(ScaleGestureDetector d){float target=Math.max(state[1],Math.min(state[1]*6,state[0]*d.getScaleFactor()));float factor=target/state[0];state[0]=target;matrix.postScale(factor,factor,d.getFocusX(),d.getFocusY());view.setImageMatrix(matrix);return true;}});
    GestureDetector gestures=new GestureDetector(context,new GestureDetector.SimpleOnGestureListener(){@Override public boolean onDown(android.view.MotionEvent e){return true;}@Override public void onLongPress(android.view.MotionEvent e){if(save!=null){dialog.dismiss();save.run();}}});
    view.setOnTouchListener((v,e)->{zoom.onTouchEvent(e);gestures.onTouchEvent(e);if(e.getActionMasked()==MotionEvent.ACTION_MOVE&&!zoom.isInProgress()&&e.getPointerCount()==1){matrix.postTranslate(e.getX()-state[2],e.getY()-state[3]);view.setImageMatrix(matrix);}state[2]=e.getX();state[3]=e.getY();return true;});
    dialog.setContentView(view);dialog.setOnDismissListener(d->{view.setImageDrawable(null);bitmap.recycle();});dialog.show();
    view.post(()->{float scale=Math.min((float)view.getWidth()/bitmap.getWidth(),(float)view.getHeight()/bitmap.getHeight());state[0]=state[1]=scale;matrix.setScale(scale,scale);matrix.postTranslate((view.getWidth()-bitmap.getWidth()*scale)/2,(view.getHeight()-bitmap.getHeight()*scale)/2);view.setImageMatrix(matrix);});
  }
}
