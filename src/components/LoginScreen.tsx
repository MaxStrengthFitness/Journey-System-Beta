/**
 * The sign-in screen: the front door (Oct 3 2026, direction A, "the three
 * squares"; features/front-door/README.md).
 *
 * One job: get a known person in fast. The three squares assemble, one line
 * says what Journey is, and two buttons say who each is for. A sign-in that
 * didn't finish is said in plain words right under the buttons
 * (features/front-door/sign-in-errors.ts). The line at the foot says which
 * studio this iPad opens, before anyone is signed in, so a trainer holding
 * the wrong iPad knows before they start. AppContent still owns the sign-in
 * itself (handleLogin, the error, the in-flight flag) and hands them in.
 */
import { useEffect, useRef, useState } from "react";
import { FrontDoorPane, GoogleMark, MicrosoftMark, Tiles, WarnIcon } from "../features/front-door/kit";
import { MICROSOFT_DOMAIN } from "../features/front-door/sign-in-errors";
import { deviceStudioLine, getDefaultStudioId, getDeviceStudio } from "../lib/default-studio";

export interface LoginScreenProps {
  isLoggingIn: boolean;
  loginError: string | null;
  onLogin: (provider: "google" | "microsoft") => void;
}

export function LoginScreen({ isLoggingIn, loginError, onLogin }: LoginScreenProps) {
  const [tried, setTried] = useState<"google" | "microsoft" | null>(null);
  const [deviceLine] = useState(() => deviceStudioLine(getDeviceStudio(), getDefaultStudioId()));
  const errorRef = useRef<HTMLDivElement>(null);

  // A new error is read out and brought into view where it happened.
  useEffect(() => {
    if (loginError) errorRef.current?.focus();
  }, [loginError]);

  const press = (provider: "google" | "microsoft") => {
    setTried(provider);
    onLogin(provider);
  };

  return (
    <FrontDoorPane label="Sign in to Journey">
      <main className="fd-page fd-page--center">
        <div className="fd-rise">
          <Tiles mode="assemble" />
        </div>
        <div className="fd-rise fd-rise--2" style={{ marginTop: 32 }}>
          <h1 className="fd-display fd-display--xl fd-center">Journey</h1>
          <p className="fd-lede fd-center">
            The coaching record for Max Strength Fitness.
            <br />
            Sign in with the account your studio added you with.
          </p>
        </div>

        <div className="fd-stack fd-rise fd-rise--3" style={{ marginTop: 32 }}>
          <button
            type="button"
            className="fd-btn fd-btn--provider"
            onClick={() => press("google")}
            disabled={isLoggingIn}
          >
            <GoogleMark />
            <span>Continue with Google</span>
            {isLoggingIn && tried === "google" && <span className="fd-spin" aria-label="Signing in" />}
          </button>
          <button
            type="button"
            className={`fd-btn fd-btn--provider${loginError && tried === "microsoft" ? " fd-btn--bad" : ""}`}
            onClick={() => press("microsoft")}
            disabled={isLoggingIn}
          >
            <MicrosoftMark />
            <span>Continue with Microsoft</span>
            {isLoggingIn && tried === "microsoft" ? (
              <span className="fd-spin" aria-label="Signing in" />
            ) : (
              <span className="fd-btn__sub">@{MICROSOFT_DOMAIN}</span>
            )}
          </button>
          {loginError && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="fd-notice fd-notice--bad fd-shake" key={loginError}>
              <WarnIcon />
              <div>{loginError}</div>
            </div>
          )}
        </div>

        <footer className="fd-foot fd-rise fd-rise--4">
          {deviceLine && (
            <span className="fd-device-line">
              <i aria-hidden="true" />
              {deviceLine}
            </span>
          )}
          <p className="fd-small" style={{ maxWidth: 400, marginTop: 8 }}>
            New to the team? Sign in anyway. Journey will ask which studio you work at and pass it to its leaders.
          </p>
        </footer>
      </main>
    </FrontDoorPane>
  );
}
