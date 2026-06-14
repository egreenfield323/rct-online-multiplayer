import { World, Command } from './types.js';
import { applyCommand } from './commands.js';
import { rideDef } from './catalog.js';
import { tickFlatRide } from './rides.js';
import { tickCoaster } from './coaster.js';
import { tickPeeps, tickSpawning } from './peeps.js';
import { tickStaff } from './staff.js';
import { tickResearch } from './research.js';
import { tickEconomy } from './economy.js';

// Advance the world exactly one tick, executing this tick's commands first.
// Must be called with identical (tick, cmds) sequences on every machine.
export function stepWorld(w: World, cmds: Command[]): void {
  for (const cmd of cmds) applyCommand(w, cmd);
  w.tick++;
  tickResearch(w);
  tickSpawning(w);
  tickPeeps(w);
  tickStaff(w);
  for (const ride of w.rides) {
    const def = rideDef(ride.type);
    if (def.category === 'coaster') tickCoaster(w, ride);
    else tickFlatRide(w, ride);
  }
  tickEconomy(w);
}
