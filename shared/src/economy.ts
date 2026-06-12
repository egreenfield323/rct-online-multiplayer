import { World, ti } from './types.js';
import { rideDef } from './catalog.js';
import {
  MONTH_TICKS, MAX_LOAN, LOAN_STEP, RESEARCH_COST_MONTH,
  MARKETING_COST, MARKETING_TICKS,
} from './constants.js';
import { addMessage } from './world.js';

const LOAN_INTEREST = 0.01; // monthly
const UPKEEP_RIDE = 5_000; // cents/month
const UPKEEP_STALL = 3_000;

export function applyLoanChange(w: World, d: 1 | -1): boolean {
  if (d === 1) {
    if (w.loan + LOAN_STEP > MAX_LOAN) return false;
    w.loan += LOAN_STEP;
    w.cash += LOAN_STEP;
  } else {
    if (w.loan < LOAN_STEP || w.cash < LOAN_STEP) return false;
    w.loan -= LOAN_STEP;
    w.cash -= LOAN_STEP;
  }
  return true;
}

export function applyMarketing(w: World): boolean {
  if (w.cash < MARKETING_COST || w.park.marketingTicks > 0) return false;
  w.cash -= MARKETING_COST;
  w.curExpense += MARKETING_COST;
  w.park.marketingTicks = MARKETING_TICKS;
  addMessage(w, 'Advertising campaign launched!', 'money');
  return true;
}

// 0..999, RCT-style park rating
export function computeParkRating(w: World): number {
  let r = 250;
  // guest mood
  if (w.peeps.length > 0) {
    let hap = 0, naus = 0;
    for (const p of w.peeps) {
      hap += p.happiness;
      naus += p.nausea;
    }
    r += Math.floor((hap / w.peeps.length) * 1.6); // up to +408
    r -= Math.floor((naus / w.peeps.length) * 0.6);
  } else {
    r += 200;
  }
  // ride variety & quality
  let rideScore = 0;
  for (const ride of w.rides) {
    const def = rideDef(ride.type);
    if (def.category === 'stall' || !ride.open) continue;
    rideScore += 28 + (ride.excitement > 0 ? Math.floor(ride.excitement / 16) : 0);
  }
  r += Math.min(220, rideScore);
  // litter drags it down
  let litter = 0;
  for (let i = 0; i < w.litter.length; i++) litter += w.litter[i] > 0 ? 1 : 0;
  r -= Math.min(150, litter * 3);
  return Math.max(0, Math.min(999, r));
}

export function tickEconomy(w: World): void {
  if (w.park.marketingTicks > 0) w.park.marketingTicks--;
  if (w.tick % 64 === 0) w.park.rating = computeParkRating(w);
  if (w.tick === 0 || w.tick % MONTH_TICKS !== 0) return;

  // ---- month rollover ----
  // upkeep
  let upkeep = 0;
  for (const ride of w.rides) {
    if (!ride.open) continue;
    upkeep += rideDef(ride.type).category === 'stall' ? UPKEEP_STALL : UPKEEP_RIDE;
  }
  const interest = Math.floor(w.loan * LOAN_INTEREST);
  const research = RESEARCH_COST_MONTH[w.research.funding];
  const charge = upkeep + interest + research;
  w.cash -= charge;
  w.curExpense += charge;

  w.months.push({
    income: w.curIncome,
    expense: w.curExpense,
    cash: w.cash,
    guests: w.peeps.length,
  });
  if (w.months.length > 16) w.months.splice(0, w.months.length - 16);
  w.curIncome = 0;
  w.curExpense = 0;
  for (const ride of w.rides) ride.monthCustomers = 0;

  if (w.cash < 0) addMessage(w, 'The park is out of money!', 'warn');
}

export function applySweep(w: World, x: number, y: number): boolean {
  const i = ti(w.size, x, y);
  if (w.litter[i] === 0) return false;
  w.litter[i] = 0;
  return true;
}
