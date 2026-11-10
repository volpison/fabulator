/**
 * Runtime side of word counts and goals: derived word statistics, goal state
 * kept per project in localStorage (always in try/catch), and the day
 * roll-over. The rules live in wordcount.ts / goals.ts.
 */
import { writable, derived, get } from "svelte/store";
import { project } from "./stores";
import { wordStats, type WordStats } from "./wordcount";
import {
  EMPTY_STATE,
  goalProgress,
  localDateKey,
  restartToday,
  sanitizeGoalState,
  trackDay,
  withGoals,
  type GoalState,
  type Goals,
} from "./goals";

const EMPTY_STATS: WordStats = { total: 0, byScene: new Map(), byChapter: new Map() };

/** Word totals per scene / chapter / project. Only the scene being edited is recounted. */
export const stats = derived(project, ($p) => ($p ? wordStats($p) : EMPTY_STATS));

export const goalState = writable<GoalState>(EMPTY_STATE);

export const progress = derived([goalState, stats], ([$g, $s]) => goalProgress($g, $s.total));

const today = writable(localDateKey());
let loadedFor: string | null = null;

const storageKey = (projectId: string) => `fabulator.goals.${projectId}`;

function load(projectId: string): GoalState {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return sanitizeGoalState(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY_STATE;
  }
}

function persist(state: GoalState) {
  const p = get(project);
  if (!p) return;
  try {
    localStorage.setItem(storageKey(p.id), JSON.stringify(state));
  } catch {
    /* goals are a convenience; never block writing */
  }
}

function sync() {
  const p = get(project);
  if (!p) return;
  if (loadedFor !== p.id) {
    loadedFor = p.id;
    goalState.set(load(p.id));
  }
  const current = get(goalState);
  const next = trackDay(current, get(stats).total, get(today));
  if (next !== current) {
    goalState.set(next);
    persist(next);
  }
}

/** Start tracking (call once at start-up). Returns a cleanup function. */
export function startGoals(): () => void {
  const unsubStats = stats.subscribe(sync);
  const unsubToday = today.subscribe(sync);
  const timer = setInterval(() => today.set(localDateKey()), 60_000);
  return () => {
    unsubStats();
    unsubToday();
    clearInterval(timer);
  };
}

export function setGoals(patch: Partial<Goals>) {
  const next = withGoals(get(goalState), patch);
  goalState.set(next);
  persist(next);
}

export function restartTodayCount() {
  const next = restartToday(get(goalState), get(stats).total, get(today));
  goalState.set(next);
  persist(next);
}
