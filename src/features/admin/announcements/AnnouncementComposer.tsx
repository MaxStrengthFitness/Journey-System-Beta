/**
 * THE announcement composer. Singular, deliberately.
 *
 * Round: Admin Overhaul, Round 2 Phase 1 (Section 8).
 *
 * There were two of these - one in AdminHubAnnouncements, one inlined in
 * FranchiseDashboardView - both writing into `hub_announcements` with
 * different field conventions, and the disagreement between them sent
 * network notices to the entire platform. See announcements/audience.ts for
 * the full account. One composer is the fix; the audience module is the
 * guarantee that it stays fixed.
 *
 * WHAT THE TWO CALLERS DIFFER IN, AND WHAT THEY DO NOT
 * ---------------------------------------------------
 * They differ in REACH: an admin can address everyone, any network, any
 * studio; a franchise owner can address their own networks and the studios
 * inside them, and nothing else. That is one prop - `scopes` - and it is
 * enforced by only offering what the caller passes, not by trusting the
 * caller to filter afterwards.
 *
 * They do not differ in anything else, so nothing else is a prop.
 *
 * THE AUDIENCE IS NAMED BEFORE PUBLISH, NOT AFTER
 * -----------------------------------------------
 * The old franchise composer's list filtered on `authorId === me`, so it
 * showed the author a tidy list of their own notices and never once said
 * where they had landed. The live summary under the form says who is about
 * to receive this, counted, before the button is pressed - which is the one
 * piece of feedback that would have made the leak visible on day one.
 */

import React, { useMemo, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Megaphone, Send, Users } from "lucide-react";
import { db } from "../../../firebase";
import type { HubAnnouncement, Studio } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminSelect,
  AdminTextarea,
} from "../primitives";
import {
  EMPTY_DRAFT,
  SHORT_CONTENT_MAX,
  announcementBody,
  audienceLabel,
  resolveAudience,
  validateDraft,
  type AnnouncementAuthor,
  type AnnouncementDraft,
  type AnnouncementScope,
  type Lifespan,
  type NetworkOption,
} from "./audience";

export interface AnnouncementComposerProps {
  author: AnnouncementAuthor;
  /** Studios this author may address. Admin passes all; an owner passes theirs. */
  studios: Pick<Studio, "id" | "name">[];
  /** Networks this author may address. Empty hides the network option. */
  networks: NetworkOption[];
  /** Which scopes this author is allowed to pick. Order is the menu order. */
  scopes: AnnouncementScope[];
  /** Already-published notices this author should see and be able to retire. */
  published: HubAnnouncement[];
  /** Called after a successful publish so the caller can refresh its list. */
  onPublished?: (id: string) => void;
  onArchived?: (id: string) => void;
  /** Panel heading. The two callers describe their reach differently. */
  title?: string;
  subtitle?: string;
}

const SCOPE_LABELS: Record<AnnouncementScope, string> = {
  universal: "Everyone",
  network: "One network",
  studio: "One studio",
};

const TYPE_OPTIONS: {
  value: NonNullable<HubAnnouncement["type"]>;
  label: string;
}[] = [
  { value: "news", label: "News" },
  { value: "shout-out", label: "Shout out" },
  { value: "event", label: "Event" },
  { value: "tip", label: "Tip" },
  { value: "holiday", label: "Holiday" },
];

const LIFESPAN_OPTIONS: { value: Lifespan; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
];

export function AnnouncementComposer({
  author,
  studios,
  networks,
  scopes,
  published,
  onPublished,
  onArchived,
  title = "Post an announcement",
  subtitle = "Goes to the alerts bell, for everyone it reaches.",
}: AnnouncementComposerProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [draft, setDraft] = useState<AnnouncementDraft>({
    ...EMPTY_DRAFT,
    scope: scopes[0] ?? "universal",
  });
  const [lifespan, setLifespan] = useState<Lifespan>("24h");
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const set = <K extends keyof AnnouncementDraft>(
    key: K,
    value: AnnouncementDraft[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const problems = useMemo(() => validateDraft(draft), [draft]);

  /**
   * The same resolution the write will use, so the sentence under the form
   * and the document that lands in Firestore cannot disagree.
   */
  const audience = useMemo(
    () => resolveAudience(draft, networks),
    [draft, networks],
  );

  const reachSentence = useMemo(() => {
    if (draft.scope === "universal") {
      return "Everyone signed in, at every studio.";
    }
    if (draft.scope === "studio") {
      const name = studios.find((s) => s.id === draft.studioId)?.name;
      return name ? `Everyone at ${name}.` : "Pick a studio above.";
    }
    const network = networks.find((n) => n.id === draft.networkId);
    if (!network) return "Pick a network above.";
    const count = audience.targetStudioIds.length;
    if (count === 0) {
      return `${network.name} has no studios in it, so this would reach nobody.`;
    }
    return `Everyone at ${count === 1 ? "the 1 studio" : `all ${count} studios`} in ${network.name}.`;
  }, [draft, studios, networks, audience]);

  const handlePublish = async () => {
    if (problems.length) {
      setShowProblems(true);
      return;
    }
    setPublishing(true);
    try {
      const body = announcementBody(draft, author, networks, lifespan, new Date());
      const ref = await addDoc(collection(db, "hub_announcements"), {
        ...body,
        createdAt: serverTimestamp(),
      });
      setDraft({ ...EMPTY_DRAFT, scope: scopes[0] ?? "universal" });
      setShowProblems(false);
      toastSuccess("Published. It is in the alerts bell now.");
      onPublished?.(ref.id);
    } catch (e: unknown) {
      toastError(
        `Could not publish: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleArchive = async (id: string) => {
    setArchiving(id);
    try {
      await updateDoc(doc(db, "hub_announcements", id), { isActive: false });
      toastSuccess("Taken down.");
      onArchived?.(id);
    } catch (e: unknown) {
      toastError(
        `Could not take it down: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setArchiving(null);
    }
  };

  const scopeOptions = scopes.filter(
    (s) => s !== "network" || networks.length > 0,
  );

  return (
    <div className="adm-two">
      <AdminPanel
        title={title}
        subtitle={subtitle}
        icon={<Megaphone className="w-4 h-4" />}
        actions={
          <AdminButton
            variant="hero"
            busy={publishing}
            onClick={handlePublish}
            disabled={publishing}
          >
            <Send className="w-3.5 h-3.5" />
            Publish
          </AdminButton>
        }
      >
        <AdminGrid>
          <AdminField label="Headline" required htmlFor="ann-title">
            <AdminInput
              id="ann-title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Q3 rollout starts Monday"
              maxLength={120}
            />
          </AdminField>

          <AdminField
            label="Short update"
            required
            htmlFor="ann-short"
            hint={`This is the line people see in the bell. ${SHORT_CONTENT_MAX - draft.shortContent.length} characters left.`}
          >
            <AdminInput
              id="ann-short"
              value={draft.shortContent}
              onChange={(e) => set("shortContent", e.target.value)}
              placeholder="New booking flow goes live Monday morning."
              maxLength={SHORT_CONTENT_MAX}
            />
          </AdminField>

          <AdminField
            label="Full message"
            htmlFor="ann-long"
            hint="Optional. Shown when someone opens the announcement."
            wide
          >
            <AdminTextarea
              id="ann-long"
              value={draft.longContent}
              onChange={(e) => set("longContent", e.target.value)}
              placeholder="Anything that does not fit in one line."
              rows={4}
            />
          </AdminField>

          {scopeOptions.length > 1 && (
            <AdminField label="Who gets it" htmlFor="ann-scope">
              <AdminSelect
                id="ann-scope"
                value={draft.scope}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    scope: e.target.value as AnnouncementScope,
                    studioId: undefined,
                    networkId: undefined,
                  }))
                }
              >
                {scopeOptions.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          )}

          {draft.scope === "studio" && (
            <AdminField label="Which studio" required htmlFor="ann-studio">
              <AdminSelect
                id="ann-studio"
                value={draft.studioId ?? ""}
                invalid={showProblems && !draft.studioId}
                onChange={(e) => set("studioId", e.target.value || undefined)}
              >
                <option value="">Pick one…</option>
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          )}

          {draft.scope === "network" && (
            <AdminField label="Which network" required htmlFor="ann-network">
              <AdminSelect
                id="ann-network"
                value={draft.networkId ?? ""}
                invalid={showProblems && !draft.networkId}
                onChange={(e) => set("networkId", e.target.value || undefined)}
              >
                <option value="">Pick one…</option>
                {networks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          )}

          <AdminField label="Kind" htmlFor="ann-type">
            <AdminSelect
              id="ann-type"
              value={draft.type}
              onChange={(e) =>
                set("type", e.target.value as AnnouncementDraft["type"])
              }
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          <AdminField label="Urgency" htmlFor="ann-priority">
            <AdminSelect
              id="ann-priority"
              value={draft.priority}
              onChange={(e) =>
                set("priority", e.target.value as HubAnnouncement["priority"])
              }
            >
              <option value="low">Normal</option>
              <option value="high">Urgent</option>
            </AdminSelect>
          </AdminField>

          <AdminField
            label="Comes down after"
            htmlFor="ann-lifespan"
            hint="It stops appearing on its own. Nobody has to remember."
          >
            <AdminSelect
              id="ann-lifespan"
              value={lifespan}
              onChange={(e) => setLifespan(e.target.value as Lifespan)}
            >
              {LIFESPAN_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        </AdminGrid>

        <div className="adm-reach">
          <Users className="w-4 h-4 shrink-0" />
          <span>{reachSentence}</span>
        </div>

        {showProblems && problems.length > 0 && (
          <AdminNotice tone="warn">
            <ul className="adm-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </AdminNotice>
        )}

      </AdminPanel>

      <AdminPanel
        title="Live now"
        subtitle="Still showing in the bell. Taking one down is immediate."
        flush
      >
        {published.length === 0 ? (
          <AdminEmpty title="Nothing live">
            Anything you publish appears here until it expires or you take it
            down.
          </AdminEmpty>
        ) : (
          <ul className="adm-ann-list">
            {published.map((a) => (
              <li key={a.id} className="adm-ann">
                <div className="adm-ann-head">
                  <span className="adm-ann-title">{a.title}</span>
                  {a.priority === "high" && (
                    <AdminBadge tone="alert">Urgent</AdminBadge>
                  )}
                  <AdminBadge>{a.type ?? "news"}</AdminBadge>
                </div>
                <p className="adm-ann-short">{a.shortContent}</p>
                <div className="adm-ann-foot">
                  <span>
                    To {audienceLabel(a, studios, networks)} · by {a.authorName}
                  </span>
                  <AdminButton
                    size="sm"
                    variant="quiet"
                    busy={archiving === a.id}
                    onClick={() => a.id && handleArchive(a.id)}
                  >
                    Take down
                  </AdminButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </div>
  );
}
