/**
 * ADMINS → STUDIOS → ALL STUDIOS — every studio, grouped by what Journey
 * knows today, each a row that opens its own page.
 *
 * Round: the Admins room (Sep 28 2026). It replaces All locations, one long
 * page with the list, the add form, the franchises, and the selected
 * studio's details, team, equipment and delete panel stacked under each
 * other. Now the list is only the list: a row is the studio's whole name,
 * one sentence (its Mindbody link, its Journey cutover, its active clients),
 * and a tap opens the studio's page. The add form opens here on request;
 * Franchises has a page of its own.
 *
 * The groups are stages.ts's, built from the Mindbody link and the cutover
 * date, because a studio's stage is not recorded (see its header).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Building2, Plus } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import { AdminButton, AdminEmpty, AdminHeader, AdminScreen } from "../../admin/primitives";
import { NewStudioPanel } from "../../admin/studios/NewStudioPanel";
import { HqGroupHead, HqRow, HqRows, HqStatus } from "../kit";
import { groupStudios, studiosCount } from "./stages";
import { clientsLine, useStudioClientCounts } from "./useStudioClientCounts";

export interface StudiosRoomProps {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  isAdmin: boolean;
  onOpenStudio: (studioId: string) => void;
  onRefresh?: (collectionName: "studios" | "networks" | "trainers") => Promise<void>;
  /** A line under a row's sentence, from outside the list (the sync check adds its word). */
  extraSay?: (studioId: string) => ReactNode;
}

export function StudiosRoom({ authTrainer, studios, networks, isAdmin, onOpenStudio, onRefresh, extraSay }: StudiosRoomProps) {
  const [adding, setAdding] = useState(false);
  const groups = useMemo(() => groupStudios(studios, networks), [studios, networks]);
  const counts = useStudioClientCounts(studios);
  const real = groups.filter((g) => g.stage !== "demo").reduce((n, g) => n + g.studios.length, 0);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Building2 className="w-5 h-5" />}
        title="All studios"
        subtitle={`${studiosCount(real)}, grouped by what Journey knows today: the Mindbody link and the Journey cutover date. A studio's stage (setting up, handed over, running) isn't recorded yet. A studio's own record is run from My Studio → Studio by its leaders, and from its page here.`}
        actions={
          isAdmin ? (
            <AdminButton variant="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              {adding ? "Close the form" : "Add a studio"}
            </AdminButton>
          ) : undefined
        }
      />

      {adding && isAdmin ? (
        <NewStudioPanel
          authTrainer={authTrainer}
          studios={studios}
          onCreated={async (id) => {
            setAdding(false);
            await onRefresh?.("studios");
            onOpenStudio(id);
          }}
        />
      ) : null}

      {groups.length === 0 ? (
        <AdminEmpty title="No studios yet">Add the first one with Add a studio. You will need its Mindbody Site ID, or mark it offline.</AdminEmpty>
      ) : (
        groups.map((g) => (
          <section key={g.stage} className="flex flex-col gap-3" aria-label={g.title}>
            <HqGroupHead title={g.title} note={g.note} />
            <HqRows label={g.title}>
              {g.studios.map((s) => (
                <HqRow
                  key={s.studioId}
                  name={s.name}
                  context={s.context}
                  openLabel={`Open ${s.name}`}
                  onOpen={() => onOpenStudio(s.studioId)}
                  say={
                    <>
                      <HqStatus tone={s.linkTone}>{s.link}</HqStatus>
                      <span>{s.cutover}</span>
                      {g.stage !== "demo" ? <span>{clientsLine(counts[s.studioId])}</span> : null}
                      {extraSay ? extraSay(s.studioId) : null}
                    </>
                  }
                />
              ))}
            </HqRows>
          </section>
        ))
      )}
    </AdminScreen>
  );
}
