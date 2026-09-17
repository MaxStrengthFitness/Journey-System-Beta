import { Sparkles } from "lucide-react";
import { useActiveStudio } from "../../../ActiveStudioContext";
import { focusOf } from "./NetworkView";

/** The network's focus this quarter, as a quiet line on the Floor. */
export function FocusBanner() {
  const { network } = useActiveStudio();
  const focus = focusOf(network);
  if (!focus) return null;
  const parts = [focus.mastery && `Mastery: ${focus.mastery}`, focus.machine && `Try the ${focus.machine}`].filter(Boolean);
  return (
    <p className="fb">
      <Sparkles size={13} aria-hidden />
      <span className="fb__what">This quarter · {parts.join(" · ")}</span>
      {focus.note && <span className="fb__note">{focus.note}</span>}
    </p>
  );
}
