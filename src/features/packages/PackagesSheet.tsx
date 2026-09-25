/**
 * PACKAGES — the full-screen sheet the post-session screen opens (and,
 * later, anything else that wants the packages in front of a client).
 *
 * It reads ONE document, the studio's package table, and draws nothing with
 * a price until pricesState says the table is this studio's and loaded: a
 * refused read never shows the defaults as if they were the studio's prices,
 * and a studio switch never shows the last studio's table for a render.
 *
 * It follows the app's light or dark theme, like every other sheet: the
 * tokens resolve on `.cx-kit` inside the portal. Escape, an outside tap,
 * the close button and Done all close it; the trainer's taps are forgotten
 * when it closes, because nothing here is saved.
 */

import { useMemo, useReducer } from "react";
import { NotebookPen, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { LoadingArea } from "../../components/LoadingMark";
import { Btn, Source } from "../client-codex/kit/primitives";
import { Picks } from "../client-codex/kit/fields";
import { useRenewalSettings } from "../renewals/useRenewalSettings";
import { priceSourceLine, sheetTitle } from "./package-copy";
import { lineup as lineupOf, showAsLabel, type Lineup, type PayMode, type ShowAs } from "./package-table";
import { initialView, packagesViewReducer } from "./packages-view";
import { pricesState } from "./prices-state";
import { PackagesPanel } from "./PackagesPanel";
import { PackagesTrainerNotes } from "./PackagesTrainerNotes";
import "./packages.css";

export interface PackagesSheetProps {
  open: boolean;
  onClose: () => void;
  /** The studio whose table to read: the client's home studio. */
  studioId: string | null;
  studioName: string | null;
  clientFirstName: string | null;
  trainerFullName: string | null;
  bookedWeekdays?: readonly number[];
}

export function PackagesSheet(props: PackagesSheetProps) {
  const { open, onClose } = props;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 translate-x-0 translate-y-0 w-full max-w-none sm:max-w-none h-dvh max-h-none rounded-none p-0 gap-0 border-0 ring-0 bg-transparent shadow-none flex flex-col"
      >
        {open ? <SheetContent {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SheetContent({ onClose, studioId, studioName, clientFirstName, trainerFullName, bookedWeekdays = [] }: PackagesSheetProps) {
  const hook = useRenewalSettings(studioId);
  const prices = pricesState(studioId, hook);
  const title = sheetTitle(studioName);

  if (prices.status !== "ready") {
    const message =
      prices.status === "no-studio"
        ? `No studio is set for ${clientFirstName || "this client"}, so there are no prices to show.`
        : prices.status === "failed"
          ? `Couldn’t load ${studioName ? `${studioName}’s` : "this studio’s"} prices, so none are shown.`
          : null;
    return (
      <Frame title={title} onClose={onClose}>
        {message ? (
          <div className="pk-state">
            <p className="pk-text">{message}</p>
          </div>
        ) : (
          <LoadingArea label="Loading the packages…" />
        )}
      </Frame>
    );
  }

  return (
    <PricedSheet
      // A different studio's table starts the trainer's taps over.
      key={studioId ?? ""}
      lineup={lineupOf(prices.settings)}
      ownTable={prices.ownTable}
      title={title}
      onClose={onClose}
      studioName={studioName}
      clientFirstName={clientFirstName}
      trainerFullName={trainerFullName}
      bookedWeekdays={bookedWeekdays}
    />
  );
}

function PricedSheet({
  lineup: l,
  ownTable,
  title,
  onClose,
  studioName,
  clientFirstName,
  trainerFullName,
  bookedWeekdays,
}: {
  lineup: Lineup;
  ownTable: boolean;
  title: string;
  onClose: () => void;
  studioName: string | null;
  clientFirstName: string | null;
  trainerFullName: string | null;
  bookedWeekdays: readonly number[];
}) {
  const start = useMemo(() => initialView(l), [l]);
  const [view, dispatch] = useReducer(packagesViewReducer, start);

  const controls = view.notes ? null : (
    <>
      <Picks
        label="Show the price as"
        options={(["session", "week", "payment"] as const).map((v) => ({ value: v, label: showAsLabel(v, view.pay) }))}
        value={view.showAs}
        onChange={(v) => dispatch({ type: "showAs", value: v as ShowAs })}
      />
      <Picks
        label="Paying"
        options={[
          { value: "monthly", label: "Every 4 weeks" },
          { value: "full", label: "In full" },
        ]}
        value={view.pay}
        onChange={(v) => dispatch({ type: "pay", value: v as PayMode })}
      />
    </>
  );

  return (
    <Frame
      title={title}
      source={priceSourceLine(studioName, ownTable)}
      onClose={onClose}
      controls={controls}
      notesButton={
        <Btn
          icon={NotebookPen}
          variant={view.notes ? "live" : "default"}
          aria-pressed={view.notes}
          onClick={() => dispatch({ type: "notes", value: !view.notes })}
        >
          Trainer notes
        </Btn>
      }
      bodyKey={view.notes ? "notes" : "packages"}
    >
      {view.notes ? (
        <PackagesTrainerNotes lineup={l} view={view} dispatch={dispatch} studioName={studioName} ownTable={ownTable} />
      ) : (
        <PackagesPanel
          lineup={l}
          view={view}
          dispatch={dispatch}
          studioName={studioName}
          clientFirstName={clientFirstName}
          trainerFullName={trainerFullName}
          bookedWeekdays={bookedWeekdays}
        />
      )}
    </Frame>
  );
}

function Frame({
  title,
  source,
  onClose,
  controls,
  notesButton,
  bodyKey,
  children,
}: {
  title: string;
  source?: string;
  onClose: () => void;
  controls?: React.ReactNode;
  notesButton?: React.ReactNode;
  /** Changing it starts the body scrolled to the top (switching views). */
  bodyKey?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cx-kit pk-sheet">
      <header className="pk-head">
        <div className="pk-head__id">
          <DialogTitle className="pk-title">{title}</DialogTitle>
          {source ? <Source>{source}</Source> : null}
        </div>
        {controls ? <div className="pk-head__controls">{controls}</div> : null}
        <div className="pk-head__actions">
          {notesButton}
          <Btn icon={X} className="pk-close" aria-label="Close the packages" onClick={onClose} />
        </div>
      </header>
      <div className="pk-body" key={bodyKey}>
        {children}
      </div>
      <footer className="pk-foot">
        <Btn variant="solid" onClick={onClose}>
          Done
        </Btn>
      </footer>
    </div>
  );
}
