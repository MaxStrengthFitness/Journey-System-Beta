const fs = require("fs");
const file = "src/components/mindbody/AppointmentCard.tsx";
let code = fs.readFileSync(file, "utf8");

// update imports
code = code.replace(
  /import \{ Zap, CheckCircle, Receipt, ArrowRight, Lock, AlertCircle \} from 'lucide-react';/,
  "import { Zap, CheckCircle, Receipt, ArrowRight, Lock, AlertCircle, Hourglass, XCircle } from 'lucide-react';"
);

// update AppointmentCardProps
code = code.replace(
  /isLocked\?: boolean;/,
  "isLocked?: boolean;\n  crossTrainStatus?: 'home' | 'none' | 'pending' | 'granted' | 'denied';"
);

// update components params
code = code.replace(
  /isNextUp,\n  isForeign,\n  isLocked,\n  rescheduledToTime,/,
  "isNextUp,\n  isForeign,\n  isLocked,\n  crossTrainStatus,\n  rescheduledToTime,"
);

// update ariaLabel
code = code.replace(
  /if \(isForeign\) \{\n    ariaLabel \+= ', foreign visitor';\n  \}/,
  `if (crossTrainStatus) {
    if (crossTrainStatus === 'granted') {
      ariaLabel += ', cross-train access granted';
    } else if (crossTrainStatus === 'pending') {
      ariaLabel += ', cross-train request pending';
    } else if (crossTrainStatus === 'denied') {
      ariaLabel += ', cross-train denied';
    } else if (crossTrainStatus === 'none') {
      ariaLabel += ', foreign visitor';
    }
  } else if (isForeign) {
    ariaLabel += ', foreign visitor';
  }`
);

// update containerClasses
code = code.replace(
  /const containerClasses = cn\([\s\S]*?isForeign && "outline outline-2 outline-dashed outline-amber\/70 outline-offset-2 dark:outline-yellow\/70",[\s\S]*?className\n  \);/,
  `let outlineClasses = "";
  if (crossTrainStatus) {
    switch (crossTrainStatus) {
      case 'none':
        outlineClasses = "outline outline-2 outline-dashed outline-amber/70 outline-offset-2 dark:outline-yellow/70";
        break;
      case 'pending':
        outlineClasses = "outline outline-2 outline-dashed outline-cyan/70 outline-offset-2";
        break;
      case 'granted':
        outlineClasses = "outline outline-2 outline-dashed outline-green/70 outline-offset-2";
        break;
      case 'denied':
        outlineClasses = "outline outline-2 outline-dashed outline-red/70 outline-offset-2";
        break;
      case 'home':
      default:
        outlineClasses = "";
        break;
    }
  } else if (isForeign) {
    outlineClasses = "outline outline-2 outline-dashed outline-amber/70 outline-offset-2 dark:outline-yellow/70";
  }

  const containerClasses = cn(
    "flex min-h-[44px] w-full items-center justify-start rounded-lg relative overflow-hidden transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    getStateClasses(state, isNextUp),
    outlineClasses,
    onClick && state !== 'completed' && "hover:translate-y-[-1px] hover:shadow-md",
    onClick && isLocked && "cursor-not-allowed",
    className
  );`
);

// update Foreign Overlay Lock
code = code.replace(
  /\{\/\* Foreign Overlay Lock \*\/\}[\s\S]*?\{\/\* Central Flow Content \*\/\}/,
  `{/* Foreign Overlay Status Icon */}
      {crossTrainStatus ? (
        <>
          {crossTrainStatus === 'none' && (
            <Lock className="absolute top-0.5 right-0.5 size-3 text-ink-l1 bg-amber dark:bg-yellow rounded-full p-0.5" aria-hidden="true" />
          )}
          {crossTrainStatus === 'pending' && (
            <Hourglass className="absolute top-0.5 right-0.5 size-3 text-ink-l1 bg-cyan rounded-full p-0.5" aria-hidden="true" />
          )}
          {crossTrainStatus === 'denied' && (
            <XCircle className="absolute top-0.5 right-0.5 size-3 text-ink-l1 bg-red rounded-full p-0.5" aria-hidden="true" />
          )}
        </>
      ) : (
        isForeign && isLocked && (
          <Lock className="absolute top-0.5 right-0.5 size-3 text-ink-l1 bg-amber dark:bg-yellow rounded-full p-0.5" aria-hidden="true" />
        )
      )}

      {/* Central Flow Content */}`
);

fs.writeFileSync(file, code);
