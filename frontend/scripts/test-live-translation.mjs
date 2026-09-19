// Run with: node frontend/scripts/test-live-translation.mjs
import {
  shouldSendInterim,
  shouldApplySegment,
  isFatalRecognitionError,
  recordAbort,
  isAbortLoop,
} from "../src/config/liveTranslation.js";

let failed = 0;
const check = (label, condition) => {
  if (condition) console.log(`  ok  - ${label}`);
  else {
    failed += 1;
    console.error(`  FAIL - ${label}`);
  }
};

console.log("shouldSendInterim");
const base = { lastText: "", lastSentAt: 0, now: 10000 };
check("sends a substantial new phrase", shouldSendInterim({ ...base, text: "hello how are you today" }));
check("skips very short fragments", !shouldSendInterim({ ...base, text: "hi there" }));
check("skips unchanged text", !shouldSendInterim({ ...base, text: "hello how are you today", lastText: "hello how are you today" }));
check("skips when sent too recently", !shouldSendInterim({ ...base, text: "hello how are you today", lastSentAt: 9500 }));
check("sends again once the gap has passed", shouldSendInterim({ ...base, text: "hello how are you today", lastSentAt: 9000 }));
check("handles space-less scripts by length", shouldSendInterim({ ...base, text: "你好今天天气怎么样呢" }));
check("ignores empty text", !shouldSendInterim({ ...base, text: "   " }));

console.log("shouldApplySegment");
const shown = { speakerId: "a", segmentId: 100, final: true };
check("applies when nothing is shown yet", shouldApplySegment(null, { speakerId: "a", segmentId: 1, final: false }));
check("applies a newer segment", shouldApplySegment(shown, { speakerId: "a", segmentId: 200, final: false }));
check("drops an older segment", !shouldApplySegment(shown, { speakerId: "a", segmentId: 50, final: true }));
check("drops a late partial for a finalised segment", !shouldApplySegment(shown, { speakerId: "a", segmentId: 100, final: false }));
check("lets the final replace its own partial", shouldApplySegment({ speakerId: "a", segmentId: 100, final: false }, { speakerId: "a", segmentId: 100, final: true }));
check("does not compare across different speakers", shouldApplySegment(shown, { speakerId: "b", segmentId: 1, final: false }));

console.log("isFatalRecognitionError");
check("not-allowed is fatal", isFatalRecognitionError("not-allowed"));
check("network is fatal (fall back to server)", isFatalRecognitionError("network"));
check("no-speech is not fatal", !isFatalRecognitionError("no-speech"));
check("aborted is not fatal", !isFatalRecognitionError("aborted"));

console.log("abort-loop detection");
let times = [];
times = recordAbort(times, 1000);
times = recordAbort(times, 2000);
check("two aborts are not yet a loop", !isAbortLoop(times));
times = recordAbort(times, 3000);
check("three aborts in a few seconds are a loop", isAbortLoop(times));
check("old aborts age out of the window", !isAbortLoop(recordAbort(recordAbort(recordAbort([], 1000), 2000), 20000)));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
