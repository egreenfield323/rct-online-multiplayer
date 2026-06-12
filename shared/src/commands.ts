import { World, Command } from './types.js';
import { applyLand, applyWater } from './terrain.js';
import { applyPath, applyUnpath } from './path.js';
import { applyScenery, applyUnscenery } from './scenery.js';
import { applyRide, applyDemolish } from './rides.js';
import { applyTrackStart, applyTrackAdd, applyTrackBack, applyTrackCancel, applyTrackDone } from './coaster.js';
import { applyTemplate } from './templates.js';
import { applyResearchFunding } from './research.js';
import { applyLoanChange, applyMarketing, applySweep } from './economy.js';
import { rideDef } from './catalog.js';

// Execute one player command against the world. Every mutation of the sim by a
// player flows through here, identically on host and guests (lockstep).
export function applyCommand(w: World, cmd: Command): boolean {
  switch (cmd.t) {
    case 'land': return applyLand(w, cmd.vx, cmd.vy, cmd.d, cmd.brush);
    case 'water': return applyWater(w, cmd.x, cmd.y, cmd.d, cmd.brush);
    case 'path': return applyPath(w, cmd.x, cmd.y, cmd.kind);
    case 'unpath': return applyUnpath(w, cmd.x, cmd.y);
    case 'scenery': return applyScenery(w, cmd.x, cmd.y, cmd.type);
    case 'unscenery': return applyUnscenery(w, cmd.x, cmd.y);
    case 'ride': return applyRide(w, cmd.type, cmd.x, cmd.y, cmd.rot);
    case 'demolish': return applyDemolish(w, cmd.rideId);
    case 'rideSet': {
      const ride = w.rides.find((r) => r.id === cmd.rideId);
      if (!ride) return false;
      if (cmd.open !== undefined) {
        const def = rideDef(ride.type);
        if (cmd.open && def.category === 'coaster' && (!ride.trackDone || ride.testFail)) return false;
        ride.open = cmd.open;
      }
      if (cmd.price !== undefined) ride.price = Math.max(0, Math.min(20_00, Math.floor(cmd.price)));
      if (cmd.name !== undefined) ride.name = cmd.name.slice(0, 40);
      return true;
    }
    case 'trackStart': return applyTrackStart(w, cmd.type, cmd.x, cmd.y, cmd.rot);
    case 'trackAdd': return applyTrackAdd(w, cmd.rideId, cmd.kind);
    case 'trackBack': return applyTrackBack(w, cmd.rideId);
    case 'trackCancel': return applyTrackCancel(w, cmd.rideId);
    case 'trackDone': return applyTrackDone(w, cmd.rideId);
    case 'template': return applyTemplate(w, cmd.tpl, cmd.x, cmd.y);
    case 'research': return applyResearchFunding(w, cmd.funding);
    case 'park': {
      if (cmd.fee !== undefined) w.park.entranceFee = Math.max(0, Math.min(50_00, Math.floor(cmd.fee)));
      if (cmd.name !== undefined) w.park.name = cmd.name.slice(0, 40);
      return true;
    }
    case 'marketing': return applyMarketing(w);
    case 'loan': return applyLoanChange(w, cmd.d);
    case 'sweep': return applySweep(w, cmd.x, cmd.y);
  }
}
