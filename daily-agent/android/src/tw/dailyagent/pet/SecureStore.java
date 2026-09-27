package tw.dailyagent.pet;
import android.content.Context;
import android.security.keystore.*;
import android.util.AtomicFile;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.io.*;
import java.nio.charset.StandardCharsets;
public final class SecureStore {
  private final Context context;
  public SecureStore(Context context){this.context=context.getApplicationContext();}
  private SecretKey key() throws Exception {
    KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
    if(!store.containsAlias("daily-pet-v1")){KeyGenerator generator=KeyGenerator.getInstance("AES","AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder("daily-pet-v1",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
    return (SecretKey)store.getKey("daily-pet-v1",null);
  }
  public synchronized void put(String name,String value)throws Exception {
    AtomicFile file=new AtomicFile(new File(context.getFilesDir(),name+".encrypted"));
    if(value==null){file.delete();return;}
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
    byte[] data=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));FileOutputStream out=null;
    try{out=file.startWrite();out.write(cipher.getIV().length);out.write(cipher.getIV());out.write(data);file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
  }
  public synchronized String get(String name)throws Exception {
    AtomicFile file=new AtomicFile(new File(context.getFilesDir(),name+".encrypted"));if(!file.getBaseFile().exists())return null;
    byte[] data=file.readFully();if(data.length<30||data[0]!=12)throw new IOException("安全儲存格式錯誤，請重新配對。");
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,data,1,12));return new String(cipher.doFinal(data,13,data.length-13),StandardCharsets.UTF_8);
  }
}
