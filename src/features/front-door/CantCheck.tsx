/**
 * Can't check: signed in, but the trainer record couldn't be read. A failed
 * read is unknown, never "no record" (CLAUDE.md), so this is never the
 * Request Access form: it says what happened, that it is the connection and
 * not the account, and the one thing to do.
 */
import { useEffect, useState } from "react";
import { FrontDoorPane, Tiles, WarnIcon } from "./kit";

export function CantCheck({ email, onRetry, onSignOut }: { email?: string | null; onRetry: () => void; onSignOut: () => void }) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <FrontDoorPane label="Journey can't check your account">
      <main className="fd-page fd-page--center">
        <Tiles mode="steps" step={1} />
        <h1 className="fd-display fd-display--l" style={{ marginTop: 34 }}>
          Journey can't check your account right now
        </h1>
        <p className="fd-lede">
          You're signed in{email ? ` as ${email}` : ""}, but this device couldn't reach Journey to find your trainer
          record. That's the connection, not your account.
        </p>
        <div className="fd-notice fd-notice--warn" style={{ marginTop: 22 }} role="status">
          <WarnIcon />
          <div>
            <b>{online ? "The connection looks slow." : "This device looks offline."}</b>
            <br />
            Check the Wi-Fi, then try again. Nothing you've done is lost.
          </div>
        </div>
        <div className="fd-stack" style={{ marginTop: 24 }}>
          <button type="button" className="fd-btn fd-btn--primary" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="fd-btn fd-btn--quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </main>
    </FrontDoorPane>
  );
}
