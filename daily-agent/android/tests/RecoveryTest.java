import tw.dailyagent.pet.Policies;
public class RecoveryTest {
  static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args){
    for(boolean job:new boolean[]{false,true}){
      for(int status:new int[]{0,408,409,429,500,502,503,504})
        check(Policies.failureAction(job,status)==Policies.FailureAction.RETRY,"transient failure must preserve request ID and pending work: "+status);
      check(Policies.failureAction(job,401)==Policies.FailureAction.EXPIRE_PAIRING,"revoked device must stop retrying credentials");
    }
    for(int status:new int[]{400,403,404,413,422}){
      check(Policies.failureAction(false,status)==Policies.FailureAction.KEEP_JOB,"notification/session failure must not discard unanswered chat: "+status);
      check(Policies.failureAction(true,status)==Policies.FailureAction.FAIL_JOB,"invalid or missing job must finish with error instead of duplicate submission: "+status);
    }
    Policies.NoticeGate notices=new Policies.NoticeGate();notices.add("old-computer","Mail",0);notices.clear();
    check(notices.take(100000,false)==null,"re-pairing must discard previous computer notices");
    check(notices.add("old-computer","Calendar",100000),"new connection has independent dedup state");
    check(notices.take(106000,false).contains("Calendar"),"new connection notifications still work");
    System.out.println("PASS: transient retry, job-error isolation, revoked pairing, notification reset");
  }
}
