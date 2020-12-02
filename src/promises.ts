
/**
 * A class containing some helpful time-based Promises for use with Async/Await.
 */
export abstract class Timekeeper{

  public static WaitForMilliseconds(Milliseconds: number): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(() => { 
        resolve(); 
      }, Milliseconds);
    });
  }

  public static WaitForSeconds(Seconds: number): Promise<void> {
    return this.WaitForMilliseconds(Seconds / 1000);
  }
}