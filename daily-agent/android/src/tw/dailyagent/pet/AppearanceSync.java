package tw.dailyagent.pet;
import android.content.Context;
import android.graphics.*;
import android.util.AtomicFile;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.io.*;
import java.security.MessageDigest;
public final class AppearanceSync {
  private final Context context;
  public AppearanceSync(Context context){this.context=context.getApplicationContext();}
  public boolean update(String base,String token,JSONObject meta)throws Exception{
    if(!meta.optBoolean("available"))return false;String version=meta.getString("version"),hash=meta.getString("sha256");if(!version.matches("[a-f0-9]{64}")||!hash.matches("[a-f0-9]{64}"))throw new IOException("外觀版本格式錯誤。");
    if(version.equals(context.getSharedPreferences("pet",0).getString("appearanceVersion","")))return false;
    HttpsURLConnection connection=(HttpsURLConnection)new URL(base+"/v1/appearance/image?version="+version).openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Authorization","Bearer "+token);
    byte[] data;
    try{if(connection.getResponseCode()!=200||!"image/png".equals(connection.getContentType()))throw new IOException("外觀更新尚未完成。");ByteArrayOutputStream out=new ByteArrayOutputStream();try(InputStream input=connection.getInputStream()){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>4*1024*1024)throw new IOException("外觀檔案超過 4 MB。");}}data=out.toByteArray();}finally{connection.disconnect();}
    StringBuilder digest=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))digest.append(String.format("%02x",b));if(!digest.toString().equals(hash))throw new IOException("外觀檔案校驗失敗，保留原外觀。");
    BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(data,0,data.length,options);boolean animated=meta.getBoolean("animated");if(options.outWidth<1||options.outHeight<1||options.outWidth>4096||options.outHeight>4096||(long)options.outWidth*options.outHeight>4194304||animated&&(options.outWidth%8!=0||options.outHeight%11!=0))throw new IOException("外觀尺寸不支援。");Bitmap bitmap=BitmapFactory.decodeByteArray(data,0,data.length);if(bitmap==null)throw new IOException("外觀無法解碼，保留原外觀。");bitmap.recycle();
    String filename="pet-"+hash+".png";AtomicFile file=new AtomicFile(new File(context.getFilesDir(),filename));FileOutputStream stream=null;try{stream=file.startWrite();stream.write(data);file.finishWrite(stream);}catch(Exception e){if(stream!=null)file.failWrite(stream);throw e;}
    AtomicFile profile=new AtomicFile(new File(context.getFilesDir(),"pet-profile.json"));stream=null;try{stream=profile.startWrite();stream.write(meta.put("file",filename).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));profile.finishWrite(stream);}catch(Exception e){if(stream!=null)profile.failWrite(stream);throw e;}
    context.getSharedPreferences("pet",0).edit().putString("appearanceVersion",version).putString("petName",meta.optString("name","桌寵")).putBoolean("petAnimated",animated).commit();File[] older=context.getFilesDir().listFiles();if(older!=null)for(File old:older)if(old.getName().matches("pet-[a-f0-9]{64}\\.png")&&!old.getName().equals(filename))old.delete();return true;
  }
}
