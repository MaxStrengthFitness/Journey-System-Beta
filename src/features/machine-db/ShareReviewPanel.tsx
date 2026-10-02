import { useCallback, useEffect, useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { fetchShareOffers } from "./fetch-share-offers";
import { useToast } from "../../contexts/ToastContext";
import { formatStudioDate } from "../../lib/studio-time";
import type { Studio, Trainer } from "../../types";
import { AdminBadge, AdminButton, AdminEmpty, AdminField, AdminNotice, AdminPanel, AdminTextarea } from "../admin/primitives";
import { useUnsavedChanges } from "../unsaved-changes";
import { decideOffer } from "./mutations";
import { KIND_LABEL, type ShareOffer } from "./offers";
import "../admin/admin.css";
import "./share-review.css";

/**
 * WAITING FOR REVIEW — the Admins dashboard's list of what studios have
 * offered to every MSF studio.
 *
 * AJ, Sep 28 2026: sharing with all MSF studios "should submit to admins
 * first for review, we can review in admin dashboard". A studio's note on a
 * machine, a playbook tip, or a machine the studio made waits here, whole,
 * until an administrator shares it (it joins every studio's Catalog) or
 * doesn't (the studio reads the note beside its switch). Nothing reaches
 * another studio before that: firestore.rules lets only an administrator set
 * `shared` (shareDecisionOk).
 *
 * Read once when the tab opens, with Refresh, rather than listened to: three
 * collection-group reads across every studio, for a screen an administrator
 * opens now and then. They carry no index of their own (the database is the
 * Enterprise edition, which builds none automatically), so each scans that
 * collection group; the three are small (a studio's notes, tips and own
 * machines), and only administrators may run them.
 */

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; offers: ShareOffer[] };

function useShareOffers() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const reload = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      // The same read Home's count makes (fetch-share-offers.ts, Oct 2 2026).
      const offers = await fetchShareOffers();
      setLoad({ status: "ready", offers });
    } catch (err) {
      setLoad({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const remove = useCallback((o: ShareOffer) => {
    setLoad((l) =>
      l.status === "ready" ? { status: "ready", offers: l.offers.filter((x) => !(x.kind === o.kind && x.studioId === o.studioId && x.docId === o.docId)) } : l,
    );
  }, []);
  return { load, reload, remove };
}

export interface ShareReviewPanelProps {
  studios: Pick<Studio, "id" | "name">[];
  trainers: Trainer[];
  /** The panel's heading; the Admins page that hosts it carries the page's own. */
  title?: string;
  /** After a decision: the Admins dashboard counts again (its sidebar and Home). */
  onChanged?: () => void;
}

export function ShareReviewPanel({ studios, trainers, title = "Waiting for review", onChanged }: ShareReviewPanelProps) {
  const { load, reload, remove } = useShareOffers();
  const studioName = useMemo(() => new Map(studios.map((s) => [s.id, s.name])), [studios]);
  const nameOf = useCallback(
    (uid: string | null) => (uid ? trainers.find((t) => t.id === uid || t.authUid === uid)?.fullName ?? null : null),
    [trainers],
  );

  return (
    <AdminPanel
      title={title}
      icon={<Share2 className="w-3.5 h-3.5" />}
      subtitle="What studios have offered to every MSF studio: a note on a machine, a tip, or a machine they made. Nothing reaches another studio until you share it."
      actions={
        <AdminButton size="sm" variant="quiet" onClick={() => void reload()} disabled={load.status === "loading"}>
          Refresh
        </AdminButton>
      }
      flush
    >
      {load.status === "loading" && <p className="mdb-review__quiet">Loading what's waiting…</p>}
      {load.status === "error" && (
        <div className="mdb-review__pad">
          <AdminNotice tone="alert">Couldn't load what's waiting, so this can't say whether anything is. {load.message}</AdminNotice>
        </div>
      )}
      {load.status === "ready" &&
        (load.offers.length === 0 ? (
          <AdminEmpty title="Nothing waiting">
            When a studio offers a note, a tip or its own machine to every studio, it waits here for you.
          </AdminEmpty>
        ) : (
          <ul className="mdb-review">
            {load.offers.map((o) => (
              <OfferRow
                key={`${o.kind}:${o.studioId}:${o.docId}`}
                offer={o}
                studioName={studioName.get(o.studioId) ?? o.studioName ?? "A studio"}
                offeredBy={nameOf(o.offeredBy)}
                onDecided={() => {
                  remove(o);
                  onChanged?.();
                }}
              />
            ))}
          </ul>
        ))}
    </AdminPanel>
  );
}

function OfferRow({
  offer,
  studioName,
  offeredBy,
  onDecided,
}: {
  offer: ShareOffer;
  studioName: string;
  offeredBy: string | null;
  onDecided: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"share" | "decline" | null>(null);

  // The note back to the studio is typing: another tab asks before it goes.
  useUnsavedChanges(declining && note.trim() !== "", `the note to ${studioName}`, {
    onDiscard: () => {
      setNote("");
      setDeclining(false);
    },
  });

  const decide = async (decision: "share" | "decline") => {
    setBusy(decision);
    try {
      await decideOffer(offer.kind, offer.studioId, offer.docId, decision, decision === "decline" ? note : undefined);
      toastSuccess(
        decision === "share"
          ? `Shared. Every MSF studio can read ${offer.title} now.`
          : `Not shared. ${studioName} sees your note beside it.`,
      );
      setNote("");
      setDeclining(false);
      onDecided();
    } catch (err) {
      toastError(`Couldn't save the decision: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const when = offer.offeredAt ? formatStudioDate(offer.offeredAt as never, { month: "short", day: "numeric" }, undefined, "") : "";
  const byline = [studioName, offeredBy ? `offered by ${offeredBy}` : null, when ? when : null].filter(Boolean).join(" · ");

  return (
    <li className="mdb-review__item">
      <div className="mdb-review__head">
        <AdminBadge>{KIND_LABEL[offer.kind]}</AdminBadge>
        <span className="mdb-review__title">{offer.title}</span>
      </div>
      <p className="mdb-review__by">{byline}</p>
      {offer.lines.length > 0 ? (
        <div className="mdb-review__body">
          {offer.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="mdb-review__by">Nothing written beyond its name.</p>
      )}

      {declining && (
        <AdminField
          label={`A note to ${studioName} (optional)`}
          hint="They read it beside the switch, and can change it and offer it again."
          htmlFor={`mdb-review-note-${offer.kind}-${offer.docId}`}
        >
          <AdminTextarea
            id={`mdb-review-note-${offer.kind}-${offer.docId}`}
            value={note}
            maxLength={300}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
        </AdminField>
      )}

      <div className="mdb-review__actions">
        {declining ? (
          <>
            <AdminButton variant="danger" busy={busy === "decline"} disabled={busy !== null} onClick={() => void decide("decline")}>
              Don't share it
            </AdminButton>
            <AdminButton
              variant="ghost"
              disabled={busy !== null}
              onClick={() => {
                setDeclining(false);
                setNote("");
              }}
            >
              Back
            </AdminButton>
          </>
        ) : (
          <>
            <AdminButton variant="primary" busy={busy === "share"} disabled={busy !== null} onClick={() => void decide("share")}>
              Share with every studio
            </AdminButton>
            <AdminButton variant="quiet" disabled={busy !== null} onClick={() => setDeclining(true)}>
              Don't share
            </AdminButton>
          </>
        )}
      </div>
    </li>
  );
}
