import { Sparkles } from "lucide-react";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { focusHeadline, focusOf } from "./focus";

/**
 * The network's focus this quarter, as a quiet line on the Floor. It is set
 * on Operations → Overview → All my studios (admin/network/NetworkActions).
 */
export function FocusBanner() {
  const { network } = useActiveStudio();
  const focus = focusOf(network);
  if (!focus) return null;
  return (
    <p className="fb">
      <Sparkles size={13} aria-hidden />
      <span className="fb__what">{focusHeadline(focus)}</span>
      {focus.note && <span className="fb__note">{focus.note}</span>}
    </p>
  );
}
