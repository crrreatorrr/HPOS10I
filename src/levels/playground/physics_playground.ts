// Physics playground: flat ground with a tunnel and a top-only platform,
// gentle and steep slopes, two loops, a curve run and a quarter pipe, moving
// platforms and a conveyor, a test dummy and tickets. Respawns Sproto after
// death. URL options: ?start=X drops him at x = X, ?accessory=wizard_hat.

import { Dev } from '../../core/dev';
import { Tuning } from '../../core/tuning';
import { GameCamera } from '../../camera/game_camera';
import { Player } from '../../player/player';
import { CanvasLayer, Node2D } from '../../runtime/node';
import { Color } from '../../runtime/color';
import { Fonts } from '../../runtime/font';
import type { Gfx } from '../../runtime/gfx';
import { KEY_BINDINGS } from '../../runtime/input';
import { Rect2, Vec2 } from '../../runtime/vec2';
import { CurveTerrain } from '../../terrain/curve_terrain';
import { TerrainLoop } from '../../terrain/loop';
import { LevelHooks } from '../common/level_root';

const RESPAWN_FRAMES = 60;
const ART_ZONE = 'z1_retro_rush_hills';
const LEVEL_BOUNDS = new Rect2(-64, -800, 4756, 864);

function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

class HintLabel extends Node2D {
  text = '';
  override draw(g: Gfx): void {
    const w = Fonts.small.measure(this.text);
    Fonts.small.draw(g, this.text, new Vec2(420 - w, 230), new Color(1, 1, 1, 0.75));
  }
}

export class PhysicsPlayground extends Node2D {
  private respawnIn = -1;

  override ready(): void {
    for (const n of this.findChildren()) {
      if (n instanceof CurveTerrain) n.setArtZone(ART_ZONE);
      if (n instanceof TerrainLoop) n.setArtZone(ART_ZONE);
    }
    const start = this.getNode<Node2D>('PlayerStart');
    if (typeof Dev.args.start === 'string') start.globalPosition = new Vec2(Number(Dev.args.start), -Tuning.physics.height_radius);
    const player = this.getNodeOrNull<Player>('Player');
    const camera = this.getNodeOrNull<GameCamera>('Camera');
    camera?.setLevelBounds(LEVEL_BOUNDS);
    if (player) {
      player.respawnAt(start.globalPosition);
      player.died.connect(() => (this.respawnIn = RESPAWN_FRAMES), { owner: this });
      camera?.snapToTarget();
    }
    if (LevelHooks.hud) this.addChild(LevelHooks.hud());
    const layer = new CanvasLayer('Hints');
    layer.layer = 11;
    const hint = new HintLabel('Hint');
    const jump = keyName(KEY_BINDINGS.jump[0]!);
    hint.text = `Move: arrows/WASD  Jump: ${jump}  Spin: Down+${jump}  F1: debug`;
    layer.addChild(hint);
    this.addChild(layer);
  }

  override physicsProcess(): void {
    if (this.respawnIn > 0) {
      this.respawnIn -= 1;
      if (this.respawnIn === 0) {
        this.respawnIn = -1;
        const player = this.getNodeOrNull<Player>('Player');
        player?.respawnAt(this.getNode<Node2D>('PlayerStart').globalPosition);
        GameCamera.current()?.snapToTarget();
      }
    }
  }
}
