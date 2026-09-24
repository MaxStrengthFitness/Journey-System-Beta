/**
 * BUILD — her build as the machines see it, then the Training story.
 *
 * Client codex, Sep 2026 (phase 12). Read first: where she sits against the
 * height the catalog's machines are set for, her reach, weight (a scan's over
 * a typed one), body fat, age and sex, her work and what she does outside the
 * studio — each with where it came from (build.ts). Then the Training story,
 * which moved here from Life (AJ's decision 6): before Max Strength, protocol
 * mastery (it sets the rep range the Journey grid's cue reads) and strength
 * experience (it sets the suggested starting weights).
 *
 * Edit opens height, wingspan and weight — with a live line saying how the
 * app reads the height as it is typed — and the Training story's editor
 * (ExperienceEditor, FORD's phase). Work and outside the studio are FORD's to
 * edit, so they carry a door there instead. Every field writes through the
 * shell's ONE form; Done only closes the editor, and the Save bar saves
 * ("Body & Pulse · Build" / "· Training story").
 */
import { ChevronRight, Ruler } from "lucide-react";
import type { Client } from "../../../types";
import { ExperienceEditor } from "../../client-life/LifeBaseline";
import {
  Btn,
  CardHead,
  Chip,
  EditButton,
  Eyebrow,
  Fact,
  FactList,
  Lede,
  Meta,
  TextInput,
  anchorProps,
  useReadEdit,
  type Pronouns,
} from "../kit";
import { heightHint, type BuildFacts } from "./build";

export interface BuildCardProps {
  client: Client;
  /** `buildFacts` over the form (what Save will write). */
  facts: BuildFacts;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: unknown) => void;
  canEdit: boolean;
  /** Unsaved changes on Build's fields, and on the Training story's. */
  dirtyBuild: boolean;
  dirtyStory: boolean;
  /** The record form's revision; a save or a discard closes the editor. */
  revision: number;
  /** Who is signed in, for dating a protocol-mastery step. */
  authorName: string | null;
  pronouns: Pronouns;
  /** FORD → Occupation, where her work is edited. */
  onEditWork: () => void;
}

export function BuildCard({
  client,
  facts,
  formData,
  updateField,
  canEdit,
  dirtyBuild,
  dirtyStory,
  revision,
  authorName,
  pronouns,
  onEditWork,
}: BuildCardProps) {
  const { open, toggle } = useReadEdit({ canEdit, revision });
  const dirty = dirtyBuild || dirtyStory;
  const text = (key: "height" | "wingspan" | "weight") => (formData[key] as string | undefined) ?? "";

  return (
    <section className="cx-card" data-editing={open ? "" : undefined} {...anchorProps("body-build")}>
      <CardHead
        eyebrow="Build"
        icon={Ruler}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={canEdit ? <EditButton open={open} onToggle={toggle} label="Build" /> : null}
      />

      {open ? (
        <div className="bp-edit">
          <div className="bp-edit__grid">
            <TextInput
              label="Height"
              value={text("height")}
              onChange={(v) => updateField("height", v)}
              placeholder={`e.g. 5'4"`}
              hint={heightHint(text("height"), facts.heightIn)}
            />
            <TextInput
              label="Wingspan"
              value={text("wingspan")}
              onChange={(v) => updateField("wingspan", v)}
              placeholder="inches, e.g. 66"
              hint="Optional. Fingertip to fingertip, arms out. Sharpens set-up on rows, presses and pulldowns."
            />
            <TextInput
              label="Weight"
              value={text("weight")}
              onChange={(v) => updateField("weight", v)}
              placeholder="lbs"
              inputMode="decimal"
              hint="An InBody scan's weight, when there is one, is shown ahead of this one."
            />
          </div>
        </div>
      ) : (
        <>
          <Lede>{facts.lede}</Lede>
          <FactList>
            <Fact label="Height" source={facts.height.source}>
              {facts.height.text}
            </Fact>
            {facts.reach ? (
              <Fact label="Reach" source={facts.reach.source}>
                {facts.reach.text}
              </Fact>
            ) : null}
            <Fact label="Weight" source={facts.weight.source}>
              {facts.weight.text}
            </Fact>
            <Fact label="Body fat" source={facts.bodyFat.source}>
              {facts.bodyFat.text}
            </Fact>
            <Fact label="Age · sex" source={facts.ageSex.source}>
              {facts.ageSex.text}
            </Fact>
            <Fact
              label={`${pronouns.possessive.charAt(0).toUpperCase()}${pronouns.possessive.slice(1)} work`}
              source={facts.work.source}
            >
              {facts.work.text}
            </Fact>
            <Fact label="Outside" source={facts.outside.source}>
              {facts.outside.text}
            </Fact>
          </FactList>
          {canEdit ? (
            <div>
              <Btn variant="quiet" iconEnd={ChevronRight} onClick={onEditWork}>
                Edit work on FORD
              </Btn>
            </div>
          ) : null}
        </>
      )}

      <hr className="bp-rule" />
      <div className="bp-subhead" {...anchorProps("body-training-story")}>
        <Eyebrow as="h4">Training story</Eyebrow>
        <Meta>moved here from Life</Meta>
        {dirtyStory && !open ? <Chip tone="live">Unsaved</Chip> : null}
      </div>
      {open ? (
        <ExperienceEditor client={client} formData={formData} updateField={updateField} authorName={authorName} />
      ) : (
        <FactList>
          <Fact label="Before us" source={facts.training.before.source}>
            {facts.training.before.text}
          </Fact>
          <Fact label="Protocol" source={facts.training.protocol.source}>
            {facts.training.protocol.text}
          </Fact>
          <Fact label="Strength" source={facts.training.strength.source}>
            {facts.training.strength.text}
          </Fact>
        </FactList>
      )}
    </section>
  );
}
