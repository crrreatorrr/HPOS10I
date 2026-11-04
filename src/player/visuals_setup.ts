// Wires Sproto's visuals into the player controller (src/player/player.ts
// PlayerHooks), in the node order of player/player.tscn: Hitbox (built by the
// player), Afterimage, Visual { Cape (behind), SkinMarks (z 1), Accessory
// (z 2) }, DebugOverlay, Effects. Also hands the controller the ticket scatter.
// Call once at boot (and in tests) before any Player is created.

import { Accessory } from './accessory';
import { Afterimage } from './afterimage';
import { Cape } from './cape';
import { DebugOverlay } from './debug_overlay';
import { PlayerHooks, type Player } from './player';
import { PlayerEffects } from './player_effects';
import { PlayerVisual } from './player_visual';
import { ScatteredTicket } from './scattered_ticket';

export function installPlayerVisuals(): void {
  PlayerHooks.makeVisuals = (player: Player) => {
    player.addChild(new Afterimage(player));
    const visual = player.addChild(new PlayerVisual(player));
    visual.addChild(new Cape(visual, false));
    visual.addChild(new Cape(visual, true));
    visual.addChild(new Accessory(visual));
    player.addChild(new DebugOverlay(player));
    player.addChild(new PlayerEffects(player));
  };
  PlayerHooks.scatter = (parent, origin, count) => {
    ScatteredTicket.scatter(parent, origin, count);
  };
}
