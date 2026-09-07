/** Shapes written by scripts/build-academy-content.ts. */

export interface Block {
  kind: "heading" | "subheading" | "bullet" | "body";
  text: string;
}

export interface Topic {
  id: string;
  title: string;
  order: number;
  source: string;
  moduleLabel?: string;
  words: number;
  readingMinutes: number;
  blocks: Block[];
}

export interface ModuleContent {
  id: string;
  title: string;
  topics: Topic[];
}

export interface IndexTopic {
  id: string;
  title: string;
  readingMinutes: number;
  words: number;
}

export interface IndexModule {
  id: string;
  n: number;
  title: string;
  blurb: string;
  topics: IndexTopic[];
}

export interface AcademyIndex {
  generatedFrom: string;
  corpusHash: string;
  totalWords: number;
  modules: IndexModule[];
  cardCount: number;
  overviewCount: number;
  glossaryCount: number;
}

export interface QuickCard {
  id: string;
  abbr: string;
  /** The app's canonical machine id, so the Catalog can link to it. */
  machineId: string | null;
  title: string;
  sections: { heading: string; items: string[] }[];
  words: number;
}

export interface CardsFile {
  cards: QuickCard[];
}

export interface GlossaryFile {
  glossary: { term: string; definition: string }[];
}

export interface OverviewsFile {
  overviews: {
    id: string;
    title: string;
    readingMinutes: number;
    words: number;
    blocks: Block[];
  }[];
}

/** A moment in the set, and the words to say at it. */
export interface CueMoment {
  moment: string;
  /** Short enough to say mid-set. These are the cues. */
  phrases: string[];
  /** The explanation around them. */
  notes: string[];
}

export interface CuesFile {
  cues: CueMoment[];
}

export interface ScriptLine {
  /** True when this is words to say, not an instruction to the trainer. */
  spoken: boolean;
  text: string;
}

export interface MachineScript {
  id: string;
  abbr: string;
  /** "Lower Body", "Upper Body", "Spine / Trunk / Core". */
  workout: string;
  machineId: string | null;
  summary?: string;
  beats: { beat: string; lines: ScriptLine[] }[];
  lines: number;
}

export interface ScriptsFile {
  scripts: MachineScript[];
}

