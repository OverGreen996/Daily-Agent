package tw.dailyagent.pet;
import java.net.URI;
import java.util.*;
/** Pure rules shared by the service and host-side regression tests. */
public final class Policies {
  public enum FailureAction { RETRY, EXPIRE_PAIRING, FAIL_JOB, KEEP_JOB }
  public static FailureAction failureAction(boolean jobRequest,int status){
    if(status==401)return FailureAction.EXPIRE_PAIRING;
    if(status<400||status>=500||status==408||status==409||status==429)return FailureAction.RETRY;
    return jobRequest?FailureAction.FAIL_JOB:FailureAction.KEEP_JOB;
  }
  public static float petScale(float value){return Float.isFinite(value)?Math.max(0.65f,Math.min(2.0f,value)):1f;}
  public static boolean needsLocation(String text){return text!=null&&text.matches("(?is).*(天氣|氣溫|會下雨|會不會下雨|附近|當地|這裡|所在地|目前位置|我在哪|weather|nearby|near me).*");}
  public static final class TouchIntent {
    public boolean down,dragged,pinched,held;
    public void begin(){down=true;dragged=false;pinched=false;held=false;}
    public void multiplePointers(){pinched=true;}
    public void move(float distance,int slop){if(distance>slop)dragged=true;}
    public boolean hold(){if(!down||dragged||pinched||held)return false;held=true;return true;}
    public boolean end(boolean cancel){boolean tap=down&&!cancel&&!dragged&&!pinched&&!held;down=false;return tap;}
  }
  public static String server(String value) throws Exception {
    URI uri=new URI(value.trim());
    if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||(uri.getPort()!=-1&&uri.getPort()!=443)||!(uri.getPath().isEmpty()||uri.getPath().equals("/")))throw new Exception("請輸入完整的 HTTPS Cloudflare 網址，不要加路徑或配對碼。");
    return "https://"+uri.getHost().toLowerCase(Locale.ROOT);
  }
  public static boolean notification(String own,String source,boolean ongoing,boolean groupSummary,boolean enabled,boolean running){return enabled&&running&&!ongoing&&!groupSummary&&!own.equals(source);}
  public static final class NoticeGate {
    private final Map<String,Long> seen=new LinkedHashMap<>();
    private final LinkedHashSet<String> apps=new LinkedHashSet<>();
    private long since=-1,last=-90000;
    public void clear(){seen.clear();apps.clear();since=-1;last=-90000;}
    public boolean add(String key,String app,long now){
      Long previous=seen.get(key);if(previous!=null&&now-previous<3600000)return false;
      seen.put(key,now);if(seen.size()>300)seen.remove(seen.keySet().iterator().next());
      if(apps.isEmpty())since=now;apps.add(app);while(apps.size()>6)apps.remove(apps.iterator().next());return true;
    }
    public String take(long now,boolean busy){
      if(apps.isEmpty()||busy||now-since<5000||now-last<90000)return null;
      String text=String.join("、",apps)+"有新通知。忙完再看就好。";apps.clear();last=now;return text;
    }
  }
}
