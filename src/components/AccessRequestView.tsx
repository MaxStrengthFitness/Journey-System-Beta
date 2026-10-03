/**
 * NOT ON A TEAM YET: someone signed in whom Journey doesn't know (the front
 * door, Oct 3 2026; features/front-door/README.md).
 *
 * Three questions, two of them taps: which studio (it goes to that studio's
 * leaders on My Studio → Team; Oct 2 2026, AJ: "Require a studio"), what they
 * do there, and a phone number if they want a call. The name and email come
 * from the sign-in. The request is kept at the person's own uid, so the next
 * time they sign in this screen says where it stands instead of showing the
 * empty form again (features/front-door/my-request.ts). New hires wait for a
 * leader: there is no Demo Mode before they're let in (AJ, Oct 3 2026).
 */
import React, { useEffect, useState } from "react";
import { Studio, Trainer } from "../types";
import { studiosInRealm } from "../features/demo-mode/access";
import { ArrowIcon, FrontDoorPane, Tiles, WarnIcon, initialsOf } from "../features/front-door/kit";
import {
  REQUEST_ROLES,
  readMyRequest,
  roleLabel,
  sendMyRequest,
  type MyRequest,
} from "../features/front-door/my-request";
import { formatStudioDateTime } from "../lib/studio-time";

/**
 * Why a request can't be sent yet, or null when its studio is in order
 * (Oct 2 2026: a request must name its studio).
 */
export function accessRequestStudioProblem(studioId: string, studiosOffered: number): string | null {
  if (studioId.trim()) return null;
  return studiosOffered > 0
    ? "Choose your studio. Your request goes to its leaders."
    : "The list of studios didn't load, so the request can't name yours yet. Check your connection and try again.";
}

interface AccessRequestViewProps {
  authenticatedUser?: any; // the signed-in Firebase user
  studios?: Studio[];
  /** Kept for callers; nobody is let in from this screen any more. */
  onTrainerCreated?: (t: Trainer) => void;
  /** Look the person up again: a leader may have let them in. */
  onCheckAgain?: () => void;
  onClose?: () => void;
  onLogout?: () => void;
}

export default function AccessRequestView({
  authenticatedUser,
  studios = [],
  onCheckAgain,
  onClose,
  onLogout,
}: AccessRequestViewProps) {
  const uid: string = authenticatedUser?.uid ?? "";
  const signedInName: string = (authenticatedUser?.displayName ?? "").trim();
  const signedInEmail: string =
    (authenticatedUser?.email || authenticatedUser?.providerData?.find((p: any) => p?.email)?.email || "").trim();

  const [standing, setStanding] = useState<MyRequest | "loading" | "unknown">(uid ? "loading" : { kind: "none" });
  const [fullName, setFullName] = useState(signedInName);
  const [email, setEmail] = useState(signedInEmail);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("Trainer");
  const [studioId, setStudioId] = useState("");
  const [reason, setReason] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The studios a request may name: never Demo Mode, which is a practice
  // studio and has no leaders to let anyone in (the realm rule).
  const requestStudios = studiosInRealm(studios, null);
  const studioName = (id: string) => requestStudios.find((s) => s.id === id)?.name || studios.find((s) => s.id === id)?.name || "";

  useEffect(() => {
    if (!uid) return;
    let live = true;
    void readMyRequest(uid).then((r) => {
      if (live) setStanding(r ?? "unknown");
    });
    return () => {
      live = false;
    };
  }, [uid]);

  const signOut = onLogout ?? onClose;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setProblem("Add your name and email address.");
      return;
    }
    const studioProblem = accessRequestStudioProblem(studioId, requestStudios.length);
    if (studioProblem) {
      setProblem(studioProblem);
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await sendMyRequest(uid, { fullName, email, phone, roleRequested: role, requestedStudioId: studioId, reason });
      setStanding({ kind: "pending", studioId, role, sentAt: new Date() });
    } catch (err) {
      console.error("Error submitting access request:", err);
      setProblem(
        "The request didn't send. Check the Wi-Fi and try again. If you've asked before, it may already be with the leaders: sign out and back in to see.",
      );
    } finally {
      setSending(false);
    }
  };

  const top = (
    <div className="fd-top">
      <Tiles small />
      {signOut && (
        <button type="button" className="fd-link" onClick={signOut}>
          Sign out
        </button>
      )}
    </div>
  );

  if (standing === "loading") {
    return (
      <FrontDoorPane label="Checking your request">
        <main className="fd-page fd-page--center" aria-busy="true">
          <Tiles mode="steps" step={2} />
          <p className="fd-small fd-center" style={{ marginTop: 28 }}>
            Checking whether you've already asked to join…
          </p>
        </main>
      </FrontDoorPane>
    );
  }

  if (standing !== "unknown" && standing.kind === "pending") {
    const name = studioName(standing.studioId) || "your studio";
    const possessive = name === "your studio" ? "Your studio's" : `${name}'s`;
    return (
      <FrontDoorPane label="Request sent">
        <main className="fd-page">
          {top}
          <div className="fd-rise fd-rise--1" style={{ marginTop: 44 }}>
            <div className="fd-eyebrow">Request sent</div>
            <h1 className="fd-display fd-display--l" style={{ marginTop: 10 }}>
              {possessive} leaders have it.
            </h1>
            <p className="fd-lede">
              Nothing else to do here. When one of them lets you in, sign in again and you'll go straight to the studio.
            </p>
          </div>
          <ol className="fd-timeline fd-rise fd-rise--2">
            <li className="is-done">
              <span className="fd-tl-dot" aria-hidden="true" />
              <div className="fd-timeline__t">
                You asked to join {name} as {/^[aeiou]/.test(roleLabel(standing.role)) ? "an" : "a"} {roleLabel(standing.role)}
              </div>
              {standing.sentAt && <div className="fd-timeline__d">{formatStudioDateTime(standing.sentAt)}</div>}
            </li>
            <li className="is-waiting">
              <span className="fd-tl-dot" aria-hidden="true" />
              <div className="fd-timeline__t">A leader lets you in</div>
              <div className="fd-timeline__d">They'll see your request on My Studio → Team.</div>
            </li>
            <li>
              <span className="fd-tl-dot" aria-hidden="true" />
              <div className="fd-timeline__t">You sign in and start</div>
              <div className="fd-timeline__d">Once you're in, Demo Mode is there to practice in.</div>
            </li>
          </ol>
          <footer className="fd-foot fd-rise fd-rise--3">
            {onCheckAgain && (
              <button type="button" className="fd-btn fd-btn--quiet" onClick={onCheckAgain}>
                Has a leader let me in? Check again
              </button>
            )}
            <p className="fd-small" style={{ marginTop: 8 }}>
              Asked the wrong studio? Tell a leader at the one you meant.
            </p>
          </footer>
        </main>
      </FrontDoorPane>
    );
  }

  if (standing !== "unknown" && (standing.kind === "approved" || standing.kind === "closed")) {
    const approved = standing.kind === "approved";
    return (
      <FrontDoorPane label={approved ? "You've been let in" : "Your request was closed"}>
        <main className="fd-page fd-page--center">
          <Tiles mode={approved ? "assemble" : "still"} />
          <h1 className="fd-display fd-display--l" style={{ marginTop: 34 }}>
            {approved ? "You've been let in" : "Your request was closed"}
          </h1>
          <p className="fd-lede">
            {approved
              ? "A leader has let you in. Check again to open your studio."
              : "A leader closed your request to join. If that's a mistake, talk to your studio leader."}
          </p>
          <div className="fd-stack" style={{ marginTop: 24 }}>
            {approved && onCheckAgain && (
              <button type="button" className="fd-btn fd-btn--primary" onClick={onCheckAgain}>
                Check again
              </button>
            )}
            {signOut && (
              <button type="button" className="fd-btn fd-btn--quiet" onClick={signOut}>
                Sign out
              </button>
            )}
          </div>
        </main>
      </FrontDoorPane>
    );
  }

  const first = (signedInName || fullName).split(/\s+/)[0];
  const chosen = studioName(studioId);
  return (
    <FrontDoorPane label="Ask to join a studio">
      <main className="fd-page fd-page--wide">
        {top}
        <div className="fd-rise fd-rise--1" style={{ marginTop: 36 }}>
          <h1 className="fd-display fd-display--l">{first ? `Welcome, ${first}.` : "Welcome."}</h1>
          <p className="fd-lede">
            You're signed in, but you aren't on a studio's team in Journey yet. Tell us where you work and its leaders
            will let you in.
          </p>
        </div>

        {standing === "unknown" && (
          <div className="fd-notice fd-notice--warn" style={{ marginTop: 18 }} role="status">
            <WarnIcon />
            <div>Journey couldn't check whether you've already asked. If you have, there's no need to ask again.</div>
          </div>
        )}

        <div className="fd-card fd-rise fd-rise--2" style={{ marginTop: 20, padding: "12px 16px" }}>
          <div className="fd-top" style={{ flexWrap: "nowrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span className="fd-avatar" aria-hidden="true">
                {authenticatedUser?.photoURL ? (
                  <img src={authenticatedUser.photoURL} alt="" referrerPolicy="no-referrer" />
                ) : (
                  initialsOf(signedInName || signedInEmail)
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <span className="fd-row__name fd-row__name--who [overflow-wrap:anywhere]">
                  {authenticatedUser.displayName || signedInEmail || "Signed in"}
                </span>
                {signedInName && <span className="fd-small" style={{ overflowWrap: "anywhere" }}>{signedInEmail}</span>}
              </div>
            </div>
            {signOut && (
              <button type="button" className="fd-link" onClick={signOut} style={{ flex: "none" }}>
                Use another account
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="fd-rise fd-rise--3" noValidate>
          {!signedInName && (
            <label className="fd-field">
              <span className="fd-field__label">Your name</span>
              <input className="fd-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </label>
          )}
          {!signedInEmail && (
            <label className="fd-field">
              <span className="fd-field__label">Your email</span>
              <input className="fd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          )}

          <fieldset className="fd-field" style={{ border: 0, padding: 0, margin: "20px 0 0" }}>
            <legend className="fd-field__label">Which studio do you work at?</legend>
            <div className="fd-grid2">
              {requestStudios.map((s) => (
                <label key={s.id} className="fd-tile">
                  <input
                    type="radio"
                    name="fd-studio"
                    className="sr-only"
                    value={s.id}
                    checked={studioId === s.id}
                    onChange={() => setStudioId(s.id || "")}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="fd-field" style={{ border: 0, padding: 0, margin: "20px 0 0" }}>
            <legend className="fd-field__label">What do you do there?</legend>
            <div className="fd-grid2">
              {REQUEST_ROLES.map((r) => (
                <label key={r.value} className="fd-tile">
                  <input
                    type="radio"
                    name="fd-role"
                    className="sr-only"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                  />
                  {r.label}
                  <small>{r.detail}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="fd-field">
            <span className="fd-field__label">
              Phone, if a leader should call you <small>(optional)</small>
            </span>
            <input
              className="fd-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          {showNote ? (
            <label className="fd-field">
              <span className="fd-field__label">
                A note for the leaders <small>(optional)</small>
              </span>
              <textarea className="fd-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={900} />
            </label>
          ) : (
            <button type="button" className="fd-link" style={{ marginTop: 8 }} onClick={() => setShowNote(true)}>
              Add a note for the leaders
            </button>
          )}

          {problem && (
            <div className="fd-notice fd-notice--bad fd-shake" role="alert" style={{ marginTop: 16 }} key={problem}>
              <WarnIcon />
              <div>{problem}</div>
            </div>
          )}

          <button type="submit" className="fd-btn fd-btn--primary" style={{ marginTop: 20 }} disabled={sending}>
            {sending ? "Sending…" : chosen ? (
              <>
                Send to {chosen}'s leaders <ArrowIcon />
              </>
            ) : (
              "Choose your studio to send"
            )}
          </button>
        </form>
      </main>
    </FrontDoorPane>
  );
}
