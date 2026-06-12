// Simulation constants. Changing any of these breaks save/replay compatibility.

export const TICK_MS = 50;
export const TPS = 20;

export const MAP = 80; // tiles per side
export const MAX_H = 28; // max vertex height (height units)
export const HU_M = 1; // meters per height unit (physics)
export const TILE_M = 4; // meters per tile side (physics)

export const MONTH_TICKS = 1300; // ~65s real time per game month
export const MONTHS = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October'];

export const MAX_PEEPS = 220;

// money is integer cents
export const START_CASH = 2_000_000; // $20,000
export const START_LOAN = 1_000_000;
export const MAX_LOAN = 3_000_000;
export const LOAN_STEP = 100_000;

export const COST_PATH = 1_200;
export const COST_QUEUE = 1_500;
export const COST_LAND = 800; // per vertex moved
export const COST_WATER = 1_000;
export const REFUND_PATH = 0;

export const RESEARCH_RATE = [0, 26, 46, 77]; // progress/tick by funding level
export const RESEARCH_GOAL = 100_000;
export const RESEARCH_COST_MONTH = [0, 10_000, 20_000, 40_000];

export const MARKETING_COST = 60_000; // $600 buys...
export const MARKETING_TICKS = MONTH_TICKS * 2; // ...2 months of ads

export const PEEP_SPEED_BASE = 0.045; // tiles per tick
export const QUEUE_MAX = 24;

export function fmtMoney(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(cents);
  const d = Math.floor(a / 100);
  const c = a % 100;
  return `${neg ? '-' : ''}$${d.toLocaleString('en-US')}.${c.toString().padStart(2, '0')}`;
}

export function dateOf(tick: number): { month: number; year: number; label: string } {
  const m = Math.floor(tick / MONTH_TICKS);
  const month = m % MONTHS.length;
  const year = Math.floor(m / MONTHS.length) + 1;
  return { month, year, label: `${MONTHS[month]}, Year ${year}` };
}
