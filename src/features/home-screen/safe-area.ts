/**
 * The iPad's safe-area insets as numbers, for code that positions things in
 * JavaScript rather than CSS.
 *
 * A select list or a menu is placed by base-ui, which keeps it 5px inside the
 * viewport. In the Home Screen app the viewport runs under the status bar and
 * the home indicator (index.html: `viewport-fit=cover`), so a long list that
 * flips up could stop under the clock, and one that opens down could end on the
 * home indicator. `popupCollisionPadding()` is base-ui's 5px plus the insets.
 *
 * The insets only exist in CSS (`env()`), so they are read off a hidden probe
 * that pads itself by them. In a Safari tab, on a desktop and in tests they
 * are 0, and the padding is base-ui's default.
 */

export interface SafeAreaInsets {
  top: number;
  bottom: number;
}

const PROBE_STYLE =
  "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
  "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)";

export function readSafeAreaInsets(doc: Document = document): SafeAreaInsets {
  const view = doc.defaultView;
  if (!doc.body || !view) return { top: 0, bottom: 0 };
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = PROBE_STYLE;
  doc.body.appendChild(probe);
  const style = view.getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
}

/** base-ui's own collision padding (5px), plus the status bar and the home indicator. */
export const BASE_COLLISION_PADDING = 5;

export function popupCollisionPadding(insets: SafeAreaInsets = readSafeAreaInsets()) {
  return {
    top: BASE_COLLISION_PADDING + insets.top,
    bottom: BASE_COLLISION_PADDING + insets.bottom,
    left: BASE_COLLISION_PADDING,
    right: BASE_COLLISION_PADDING,
  };
}
