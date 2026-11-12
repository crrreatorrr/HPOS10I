import type { Player } from '../../../player/player';
import type { Gfx } from '../../../runtime/gfx';
import { circleShape } from '../../../runtime/physics';
import { tree } from '../../../runtime/tree';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import { Enemy } from '../enemy_base';
import { PillArt } from '../pill_art';
import { drawRemixSprite, RemixArt } from './remix_art';

const CORE = new Vec2(0, -30);
const CORE_RADIUS = 12;
const SHIELD_RADIUS = 7;
const ORBIT_RADIUS = 21;

/** Two physical shields move around an otherwise vulnerable hovering core. */
export class OrbitGuard extends Enemy {
  override tier = 4;
  private angle = Math.PI / 2;
  private shieldContacts = new Set<Player>();
  private readonly shields: [PlayerArea, PlayerArea];

  constructor() {
    super('OrbitGuard');
    this.addShape(circleShape(CORE_RADIUS, CORE));
    const makeShield = (name: string): PlayerArea => {
      const shield = new PlayerArea(name);
      shield.collisionLayer = PlayerArea.LAYER_HAZARDS;
      shield.addShape(circleShape(SHIELD_RADIUS));
      return this.addChild(shield);
    };
    this.shields = [makeShield('ShieldA'), makeShield('ShieldB')];
    this.updateOrbit();
  }

  override isOpenTo(player: Player): boolean {
    return !this.shields.some((shield) => shield.playersInside().includes(player));
  }

  override touch(player: Player): void {
    // Shield contact already resolved for this tick. Do not bounce or hurt
    // twice when the same player is also touching the core.
    if (this.isOpenTo(player)) super.touch(player);
  }

  override enemyPhysics(): void {
    const contacts = new Set<Player>();
    for (const shield of this.shields) {
      for (const player of shield.playersInside()) {
        if (player.state === 'dead') continue;
        if (!player.isAttacking()) {
          player.hurt(shield.globalPosition);
          continue;
        }
        if (!this.shieldContacts.has(player) && !contacts.has(player) &&
          player.getMeta<number>(Enemy.BOUNCE_META, -1) !== tree.physicsFrames) {
          player.setMeta(Enemy.BOUNCE_META, tree.physicsFrames);
          player.bounceOff(shield.globalPosition.y, true);
        }
        contacts.add(player);
      }
    }
    this.shieldContacts = contacts;
    this.angle = (this.angle + this.moveSpeed(0.033)) % (2 * Math.PI);
    this.updateOrbit();
  }

  private updateOrbit(): void {
    const offset = new Vec2(Math.cos(this.angle) * ORBIT_RADIUS, Math.sin(this.angle) * ORBIT_RADIUS);
    this.shields[0].position = CORE.add(offset);
    this.shields[1].position = CORE.sub(offset);
  }

  cullRect(): Rect2 { return new Rect2(-30, -60, 60, 60); }

  override draw(g: Gfx): void {
    const tick = Math.floor(tree.physicsFrames / 9);
    if (!drawRemixSprite(g, RemixArt.guard, tick, CORE, new Vec2(24, 24))) g.circle(CORE, CORE_RADIUS, PillArt.SPIKE);
    for (let i = 0; i < this.shields.length; i++) {
      const at = this.shields[i]!.position;
      if (!drawRemixSprite(g, RemixArt.satellite, tick + i * 2, at, new Vec2(14, 14))) {
        g.circle(at, SHIELD_RADIUS, PillArt.FLASH);
      }
    }
  }
}
