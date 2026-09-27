import tw.dailyagent.pet.PetAnimationRules;
public class PetAnimationRulesTest {
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args){
    check(PetAnimationRules.COUNTS[0]==6,"neutral frame leaked into idle loop");
    check(PetAnimationRules.row("thinking")==7&&PetAnimationRules.row("searching")==7,"processing row");
    check(PetAnimationRules.row("failed")==5&&PetAnimationRules.row("weather_alert")==6,"event rows");
    check(PetAnimationRules.interval(1)==100&&PetAnimationRules.interval(3)==150&&PetAnimationRules.interval(0)==250,"desktop frame timing");
    check(PetAnimationRules.nextAmbient("waving").equals("jumping")&&PetAnimationRules.nextAmbient("jumping").equals("waving"),"ambient deck rotation");
    check(PetAnimationRules.gestureDuration("waving")==1200&&PetAnimationRules.gestureDuration("jumping")==1500,"two-loop gesture length");
    int frame=3;
    for(int i=0;i<30;i++)frame=PetAnimationRules.movementFrame(true,1,1,frame);
    check(frame==3,"frequent same-direction touch events must not rewind walking frames");
    check(PetAnimationRules.movementFrame(true,1,2,3)==0,"direction changes restart the new animation");
    check(PetAnimationRules.movementFrame(false,1,1,3)==0,"new drag starts at first frame");
    System.out.println("PASS: Android pet uses desktop sprite rows, timing, task ownership and ambient rotation");
  }
}
