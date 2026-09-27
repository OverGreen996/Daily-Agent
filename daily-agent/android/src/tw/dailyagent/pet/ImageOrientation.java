package tw.dailyagent.pet;
import android.graphics.*;
import android.media.ExifInterface;
import java.io.ByteArrayInputStream;
final class ImageOrientation {
  static Bitmap upright(Bitmap bitmap,byte[] raw){
    int orientation=1;try{orientation=new ExifInterface(new ByteArrayInputStream(raw)).getAttributeInt(ExifInterface.TAG_ORIENTATION,1);}catch(Exception ignored){}
    Matrix matrix=new Matrix();switch(orientation){case 2:matrix.setScale(-1,1);break;case 3:matrix.setRotate(180);break;case 4:matrix.setScale(1,-1);break;case 5:matrix.setRotate(90);matrix.postScale(-1,1);break;case 6:matrix.setRotate(90);break;case 7:matrix.setRotate(-90);matrix.postScale(-1,1);break;case 8:matrix.setRotate(-90);break;default:return bitmap;}
    Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),matrix,true);if(rotated!=bitmap)bitmap.recycle();return rotated;
  }
}
