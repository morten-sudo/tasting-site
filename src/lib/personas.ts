// The shape of the personas document that /superadmin/dev/personas/ shows: the row 'personas' in public.dev_docs,
// readable only by the superadmin (is_admin()). The texts are never in the repo or the site's build – only these
// types are. The page renders everything from the document: the groups and their tabs, the measures, the personas,
// the scenarios per group, the overview and "shop and online" blocks, and the intro of the comparison chart.

export type Group = 'guest' | 'host' | 'commercial';
export type Metric = 'knowledge' | 'tech' | 'tastings' | 'company' | 'trade' | 'numbers' | 'influence';

export interface Persona {
  id: string;
  group: Group;
  name: string;
  age: number;
  archetype: string;
  /** Role chips */
  roles: string[];
  quote: string;
  /** One line for the cards */
  short: string;
  story: string;
  personality: string;
  dreams: string;
  facts: [string, string][];
  goals: string[];
  frustrations: string[];
  evening: { before: string; during: string; after: string };
  /** What the product already gives this person (checked against the code) */
  today: string[];
  /** Needs the product does not meet yet */
  gaps: string[];
  /** What it looks like when the person gets value */
  signal: string;
  /** What to ask a real person, to check the persona */
  check: string;
  /** The rows of the group's comparison: [row, value], the same rows in the same order for everyone in a group */
  compare: [string, string][];
  /** The measures, 1–5 */
  scores: Record<Metric, number>;
}

/** How much a scenario matters to a persona: key (decisive), use (uses it), null (not at all) */
export type Weight = 'key' | 'use' | null;
export interface Scenario {
  phase: string;
  what: string;
  /** persona id → weight */
  weight: Record<string, Weight>;
  /** Covered today (checked against the code) */
  covered: 'yes' | 'partly' | 'no';
  /** The short explanation under the chip */
  note?: string;
}

/** One line of text: a bold start, the text, and a source link at the end */
export interface Item { strong?: string; text: string; source?: { label: string; url: string } }

/** The blocks of the overview and "shop and online" tabs, in order */
export type Block =
  | { type: 'notice'; tone?: 'info' | 'warn'; items: Item[] }
  | { type: 'cards' }
  | { type: 'list'; title: string; hint?: string; ordered?: boolean; items: Item[] }
  | { type: 'status'; title: string; head: [string, string]; rows: { step: string; status: string; done: boolean }[]; facts?: [string, string][] }
  | { type: 'table'; title: string; head: string[]; rows: string[][] }
  | { type: 'text'; title?: string; text: string; source?: Item['source'] };

export interface PersonasDoc {
  version: number;
  intro: string;
  tabs: { overview: string; shop: string; pivot: string };
  /** In the order of the tabs; tab is also the tab's address (#vaerter …); note: shown on the tab and under "today" */
  groups: { id: Group; tab: string; label: string; note?: string }[];
  metrics: { id: Metric; label: string }[];
  personas: Persona[];
  scenarioIntro: string;
  scenarios: Record<Group, Scenario[]>;
  overview: Block[];
  shop: Block[];
  pivot: { intro: string; start: [Metric, Metric] };
}
