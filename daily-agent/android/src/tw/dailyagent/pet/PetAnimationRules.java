package tw.dailyagent.pet;

/** Sprite v2 animation contract shared with the Windows pet. */
public final class PetAnimationRules {
  public static final String[] NAMES={"idle","running-right","running-left","waving","jumping","failed","waiting","thinking","review","look-upper","look-lower"};
  public static final int[] COUNTS={6,8,8,4,5,8,6,6,6,8,8};
  private PetAnimationRules(){}
  public static int row(String state){
    if(state==null)return 0;
    for(int i=0;i<NAMES.length;i++)if(NAMES[i].equals(state))return i;
    if(state.equals("reading")||state.equals("searching")||state.equals("running"))return 7;
    if(state.equals("weather_alert")||state.equals("alert")||state.equals("sleepy"))return 6;
    return 0;
  }
  public static int interval(int row){return row==1||row==2?100:row==3||row==4?150:row==0||row>=9?250:180;}
  public static String nextAmbient(String last){return "waving".equals(last)?"jumping":"waving";}
  public static int movementFrame(boolean moving,int previousRow,int nextRow,int frame){return moving&&previousRow==nextRow?frame:0;}
  public static long gestureDuration(String state){int row=row(state);return (long)COUNTS[row]*interval(row)*2;}
}
