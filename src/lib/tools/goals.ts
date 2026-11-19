/**
 * Writing goals: a daily word target and a manuscript target, plus "words
 * written today". Pure (no Svelte/Tauri), unit-tested; goalsStore.ts keeps
 * the state per project in localStorage.
 *
 * "Written today" is the project's word total now minus the total at the
 * start of the day. If you cut text below that starting point the start is
 * lowered with it, so after a heavy edit new writing counts straight away
 * instead of first having to win the deleted words back.
 */

export type Goals = {
  /** Words per day; 0 = no daily goal. */
  daily: number;
  /** Words for the finished manuscript; 0 = no target. */
  total: number;
};

export type DayRecord = { date: string; baseline: number };

export type GoalState = { goals: Goals; day: DayRecord | null };

export const MAX_GOAL = 10_000_000;

export const EMPTY_STATE: GoalState = { goals: { daily: 0, total: 0 }, day: null };

/** Local calendar date, e.g. "2026-11-08" (the day rolls over at local midnight). */
export function localDateKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const wholeNumber = (v: unknown): number | null => {
  if (typeof v === "string" && v.trim() !== "") v = Number(v.replace(/[,\s]/g, ""));
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
};

/** A goal typed by the user: whole number in 0..MAX_GOAL (0 switches it off). Bad input -> 0. */
export function cleanGoal(v: unknown): number {
  const n = wholeNumber(v);
  return n === null ? 0 : Math.min(MAX_GOAL, Math.max(0, n));
}

/** Anything (e.g. parsed localStorage) -> a valid state. */
export function sanitizeGoalState(raw: unknown): GoalState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const g = (r.goals && typeof r.goals === "object" ? r.goals : {}) as Record<string, unknown>;
  const d = r.day;
  const baseline = d && typeof d === "object" ? wholeNumber((d as any).baseline) : null;
  const date = d && typeof d === "object" ? (d as any).date : null;
  return {
    goals: { daily: cleanGoal(g.daily), total: cleanGoal(g.total) },
    day:
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && baseline !== null && baseline >= 0
        ? { date, baseline }
        : null,
  };
}

/**
 * Bring the day record up to date for the current word total: a new day
 * starts from the current total, and cutting below the start lowers it.
 * Returns the same object when nothing changed.
 */
export function trackDay(state: GoalState, total: number, today: string): GoalState {
  const day = state.day;
  if (!day || day.date !== today) return { ...state, day: { date: today, baseline: total } };
  if (total < day.baseline) return { ...state, day: { date: today, baseline: total } };
  return state;
}

export type Progress = {
  value: number;
  goal: number;
  /** 0..1 for drawing a bar. */
  ratio: number;
  /** value / goal as a whole percent (can exceed 100). */
  percent: number;
  remaining: number;
  done: boolean;
};

function progressOf(value: number, goal: number): Progress | null {
  if (goal <= 0) return null;
  return {
    value,
    goal,
    ratio: Math.min(1, Math.max(0, value / goal)),
    percent: Math.floor((value / goal) * 100),
    remaining: Math.max(0, goal - value),
    done: value >= goal,
  };
}

export type GoalProgress = {
  writtenToday: number;
  daily: Progress | null;
  manuscript: Progress | null;
};

/** `state` should already have been through trackDay for this total. */
export function goalProgress(state: GoalState, total: number): GoalProgress {
  const baseline = state.day?.baseline ?? total;
  const writtenToday = Math.max(0, total - baseline);
  return {
    writtenToday,
    daily: progressOf(writtenToday, state.goals.daily),
    manuscript: progressOf(total, state.goals.total),
  };
}

/** Start today's count from where the manuscript is now. */
export function restartToday(state: GoalState, total: number, today: string): GoalState {
  return { ...state, day: { date: today, baseline: total } };
}

export function withGoals(state: GoalState, patch: Partial<Goals>): GoalState {
  return {
    ...state,
    goals: {
      daily: patch.daily === undefined ? state.goals.daily : cleanGoal(patch.daily),
      total: patch.total === undefined ? state.goals.total : cleanGoal(patch.total),
    },
  };
}
