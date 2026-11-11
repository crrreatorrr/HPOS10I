// A floor switch (Capital Mansion): a brass plate in the floor that Sproto
// presses by stepping (or landing) on it; its sensor reaches `triggerHeight`
// px up, so running or jumping across the plate presses it too. It opens the
// doors at `doors` (node paths to Door nodes, relative to the switch), plays
// `menu_select` as its click and stays pressed. The origin is the plate's
// centre, on the floor. Node names should contain "switch" (QA's lint counts
// doors and switches for R4).

import { drawPropSprite, PropSprite } from '../prop_sprite';
import { Audio } from '../../../core/audio';
import { Color } from '../../../runtime/color';
import type { Gfx } from '../../../runtime/gfx';
import type { Node } from '../../../runtime/node';
import { Signal } from '../../../runtime/signal';
import { Rect2, Vec2 } from '../../../runtime/vec2';
import { PlayerArea } from '../../common/player_area';
import type { Configurable, Props } from '../../common/props';

const PLATE = new Color(0.95, 0.8, 0.4);
const PLATE_DARK = new Color(0.6, 0.48, 0.2);
const PLATE_GLOW = PLATE.withAlpha(0.12);
const FRAME = new Color(0.3, 0.32, 0.4);
const OUTLINE = new Color(0.08, 0.08, 0.12);

type RectShape = { kind: 'rect'; size: Vec2; offset: Vec2; disabled?: boolean };

/** Anything with an open() method (Door). */
interface Openable {
  open(): void;
}

function isOpenable(n: Node | null): n is Node & Openable {
  return !!n && typeof (n as Partial<Openable>).open === 'function';
}

export class FloorSwitch extends PlayerArea implements Configurable {
  readonly pressed = new Signal();

  /** Paths to the doors it opens, relative to this switch ("../HallDoor1"). */
  doors: string[] = [];
  width = 32.0;
  triggerHeight = 96.0;

  isPressed = false;
  /** The level file had `doors` but not as a list (see ready()). */
  private doorsUnreadable = false;
  private readonly shape: RectShape = { kind: 'rect', size: Vec2.ZERO, offset: Vec2.ZERO };

  constructor(name = 'FloorSwitch') {
    super(name);
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    this.addShape(this.shape);
    this.layout();
  }

  applyProps(p: Props): void {
    if (p.has('doors')) {
      const raw = p.raw<unknown>('doors');
      if (Array.isArray(raw)) this.doors = raw.map(String);
      else this.doorsUnreadable = true;
    }
    this.width = p.num('width', this.width);
    this.triggerHeight = p.num('trigger_height', this.triggerHeight);
    this.layout();
  }

  private layout(): void {
    this.shape.size = new Vec2(this.width, this.triggerHeight + 2);
    this.shape.offset = new Vec2(0, -this.triggerHeight / 2 + 1);
    this.shapesChanged();
  }

  override ready(): void {
    this.collisionLayer = PlayerArea.LAYER_OBJECTS;
    this.monitorable = false;
    // The level converter turned typed NodePath arrays into the string
    // "Array" (tools/levels/convert_tscn.mjs). Every level pairs FloorSwitchN
    // with its sibling HallDoorN, so fall back to that pairing.
    if (this.doors.length === 0 && this.doorsUnreadable) {
      const m = /(\d+)$/.exec(this.name);
      if (m) this.doors = [`../HallDoor${m[1]}`];
    }
  }

  override physicsProcess(): void {
    if (this.isPressed) return;
    for (const player of this.playersInside()) {
      if (player.state !== 'dead') {
        this.press();
        return;
      }
    }
  }

  press(): void {
    if (this.isPressed) return;
    this.isPressed = true;
    Audio.playSfx('menu_select');
    for (const path of this.doors) {
      const door = this.getNodeOrNull(path);
      if (isOpenable(door)) door.open();
    }
    this.pressed.emit();
  }

  cullRect(): Rect2 {
    const half = this.width / 2;
    return new Rect2(-half - 2, -this.triggerHeight, this.width + 4, this.triggerHeight + 1);
  }

  override draw(g: Gfx): void {
    const half = this.width / 2;
    const sprite = this.isPressed ? PropSprite.pressedSwitch : PropSprite.floorSwitch;
    const height = this.isPressed ? 3 : 6;
    const drawn = drawPropSprite(g, sprite, new Vec2(0, -height / 2),
      new Vec2((this.width + 2) / 34, height / (this.isPressed ? 6 : 8)));
    if (!drawn) {
      g.rect(-half - 2, -7, this.width + 4, 7, OUTLINE);
      g.rect(-half - 1, -6, this.width + 2, 6, FRAME);
      g.rect(-half + 1, -height, this.width - 2, height, PLATE_DARK);
      g.rect(-half + 1, -height, this.width - 2, 1, PLATE);
    }
    // A faint light column over the plate: the sensor.
    if (!this.isPressed) g.rect(-half + 4, -this.triggerHeight, this.width - 8, this.triggerHeight - 6, PLATE_GLOW);
  }
}
