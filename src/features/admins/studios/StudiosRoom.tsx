/**
 * ADMINS → STUDIOS → ALL STUDIOS — every studio, grouped by what Journey
 * knows today, each a row that opens its own page.
 *
 * Round: the Admins room (Sep 28 2026). It replaces All locations, one long
 * page with the list, the add form, the franchises, and the selected
 * studio's details, team, equipment and delete panel stacked under each
 * other. Now the list is only the list: a row is the studio's whole name,
 * one sentence (its stage when one is recorded, its Mindbody link, its
 * Journey cutover, its active clients), and a tap opens the studio's page.
 * Franchises has a page of its own.
 *
 * The second wave (Sep 28 2026): Add a studio opens the three-screen sheet
 * (launches/AddStudioSheet.tsx), and a studio's recorded stage — setting up,
 * handed over, running — is said on its row; the studios opening have their
 * board on Launches. The groups stay stages.ts's, built from the Mindbody
 * link and the cutover date, which every studio carries whether or not a
 * stage was ever recorded.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Building2, Plus } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { AdminButton, AdminEmpty, AdminHeader, AdminScreen } from "../../admin/primitives";
import { HqGroupHead, HqRow, HqRows, HqStatus } from "../kit";
import { AddStudioSheet } from "../launches/AddStudioSheet";
import { stageLine } from "../launches/checklist";
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
  /** The machine catalog, for Add a studio's standard set. */
  catalog?: MachineCatalogEntry[];
  catalogLoading?: boolean;
}

export function StudiosRoom({
  authTrainer,
  studios,
  networks,
  isAdmin,
  onOpenStudio,
  onRefresh,
  extraSay,
  catalog = [],
  catalogLoading = false,
}: StudiosRoomProps) {
  const [adding, setAdding] = useState(false);
  const groups = useMemo(() => groupStudios(studios, networks), [studios, networks]);
  const counts = useStudioClientCounts(studios);
  const real = groups.filter((g) => g.stage !== "demo").reduce((n, g) => n + g.studios.length, 0);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Building2 className="w-5 h-5" />}
        title="All studios"
        subtitle={`${studiosCount(real)}, grouped by what Journey knows today: the Mindbody link and the Journey cutover date. A studio's stage, where head office has recorded one, is on its row; the studios opening are on Launches. A studio's own record is run from My Studio → Studio by its leaders, and from its page here.`}
        actions={
          isAdmin ? (
            <AdminButton variant="primary" onClick={() => setAdding(true)}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add a studio
            </AdminButton>
          ) : undefined
        }
      />

      {groups.length === 0 ? (
        <AdminEmpty title="No studios yet">Add the first one with Add a studio. You will need its Mindbody Site ID, or mark it offline.</AdminEmpty>
      ) : (
        groups.map((g) => (
          <section key={g.stage} className="flex flex-col gap-3" aria-label={g.title}>
            <HqGroupHead title={g.title} note={g.note} />
            <HqRows label={g.title}>
              {g.studios.map((s) => {
                const studio = studios.find((x) => x.id === s.studioId);
                const stage = studio ? stageLine(studio) : null;
                return (
                  <HqRow
                    key={s.studioId}
                    name={s.name}
                    context={s.context}
                    openLabel={`Open ${s.name}`}
                    onOpen={() => onOpenStudio(s.studioId)}
                    say={
                      <>
                        {stage ? <span>{stage}</span> : null}
                        <HqStatus tone={s.linkTone}>{s.link}</HqStatus>
                        <span>{s.cutover}</span>
                        {g.stage !== "demo" ? <span>{clientsLine(counts[s.studioId])}</span> : null}
                        {extraSay ? extraSay(s.studioId) : null}
                      </>
                    }
                  />
                );
              })}
            </HqRows>
          </section>
        ))
      )}

      {isAdmin ? (
        <AddStudioSheet
          open={adding}
          authTrainer={authTrainer}
          studios={studios}
          networks={networks}
          catalog={catalog}
          catalogLoading={catalogLoading}
          onClose={() => setAdding(false)}
          onCreated={async (id) => {
            setAdding(false);
            await onRefresh?.("networks");
            await onRefresh?.("studios");
            onOpenStudio(id);
          }}
        />
      ) : null}
    </AdminScreen>
  );
}
