#!/usr/bin/env node
// One-time converter from the Godot level scenes (.tscn) and terrain tilesets
// (.tres) to the JSON the engine-free game loads. Kept for reference: after
// the cut-over the JSON files are the source of truth.
//
//   node tools/levels/convert_tscn.mjs
//
// Output:
//   src/levels/data/<zone>/<act>.json   node tree with typed property values
//   src/levels/data/tilesets/<id>.json  collision polygons per atlas cell
//
// Value encoding (JSON): Vector2 -> {"v2":[x,y]}, Color -> {"color":[r,g,b,a]},
// PackedVector2Array -> {"v2s":[x0,y0,x1,y1,...]}, Packed*Array -> plain arrays,
// ExtResource -> {"res":"res://..."} (scripts/scenes/textures), SubResource ->
// {"sub":"Type","props":{...}} inlined, TileMapLayer data -> {"cells":[[x,y,ax,ay],...]}.

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'src/levels/data');

const LEVELS = [
  'levels/test_zone/test_zone.tscn',
  'levels/z1_retro_rush_hills/act1.tscn',
  'levels/z1_retro_rush_hills/act2.tscn',
  'levels/z2_wizard_academy/act1.tscn',
  'levels/z2_wizard_academy/act2.tscn',
  'levels/z3_capital_mansion/act1.tscn',
  'levels/z3_capital_mansion/act2.tscn',
  'playground/physics_playground.tscn',
];

// --- Value parser -------------------------------------------------------------------

function parseValue(src, ctx) {
  let i = 0;
  const s = src.trim();
  const peek = () => s[i];
  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  function parseAny() {
    skipWs();
    const c = peek();
    if (c === '"') return parseString();
    if (c === '[') return parseArray();
    if (c === '{') return parseDict();
    if (c === '&' && s[i + 1] === '"') {
      i++;
      return parseString();
    }
    if (c === '^' && s[i + 1] === '"') {
      i++;
      return parseString();
    }
    if (/[-0-9.]/.test(c)) return parseNumber();
    // identifier / constructor
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!m) throw new Error(`bad value at ${i}: ${s.slice(i, i + 40)}`);
    const word = m[0];
    i += word.length;
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    if (word === 'inf') return 1e308;
    if (word === 'nan') return null;
    skipWs();
    if (peek() !== '(') return word;
    i++; // (
    const args = [];
    skipWs();
    while (peek() !== ')') {
      args.push(parseAny());
      skipWs();
      if (peek() === ',') i++;
      skipWs();
    }
    i++; // )
    return construct(word, args, ctx);
  }
  function parseString() {
    i++; // "
    let out = '';
    while (s[i] !== '"') {
      if (s[i] === '\\') {
        i++;
        const e = s[i];
        out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
      } else out += s[i];
      i++;
    }
    i++;
    return out;
  }
  function parseNumber() {
    const m = /^-?[0-9.]+(e[-+]?[0-9]+)?/i.exec(s.slice(i));
    i += m[0].length;
    return Number(m[0]);
  }
  function parseArray() {
    i++;
    const out = [];
    skipWs();
    while (peek() !== ']') {
      out.push(parseAny());
      skipWs();
      if (peek() === ',') i++;
      skipWs();
    }
    i++;
    return out;
  }
  function parseDict() {
    i++;
    const out = {};
    skipWs();
    while (peek() !== '}') {
      const k = parseAny();
      skipWs();
      if (peek() === ':') i++;
      out[String(k)] = parseAny();
      skipWs();
      if (peek() === ',') i++;
      skipWs();
    }
    i++;
    return out;
  }
  return parseAny();
}

function construct(word, args, ctx) {
  switch (word) {
    case 'Vector2':
    case 'Vector2i':
      return { v2: [args[0], args[1]] };
    case 'Rect2':
    case 'Rect2i':
      return { rect: args.slice(0, 4) };
    case 'Color':
      return { color: [args[0], args[1], args[2], args[3] ?? 1] };
    case 'PackedVector2Array':
      return { v2s: args };
    case 'PackedFloat32Array':
    case 'PackedFloat64Array':
    case 'PackedInt32Array':
    case 'PackedInt64Array':
    case 'PackedStringArray':
      return args;
    case 'PackedByteArray':
      return { bytes: args[0] };
    case 'ExtResource':
      return { res: ctx.ext[args[0]] ?? `missing:${args[0]}` };
    case 'SubResource':
      return ctx.sub[args[0]] ?? { sub: 'missing' };
    case 'NodePath':
      return { nodepath: args[0] };
    case 'StringName':
      return args[0];
    case 'Array':
      return args[0];
    case 'Transform2D':
      return { transform: args };
    default:
      return { ctor: word, args };
  }
}

// --- File parser --------------------------------------------------------------------

function parseResourceFile(text) {
  const sections = [];
  let current = null;
  const lines = text.split('\n');
  let pending = '';
  for (const raw of lines) {
    const line = pending ? pending + '\n' + raw : raw;
    if (!pending && line.startsWith('[') && /\]\s*$/.test(line)) {
      current = { header: line.trim(), props: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (line.trim() === '') continue;
    // Multi-line values (dicts, arrays): keep reading until brackets balance.
    const depth = [...line].reduce((d, ch) => d + (ch === '(' || ch === '[' || ch === '{' ? 1 : ch === ')' || ch === ']' || ch === '}' ? -1 : 0), 0);
    if (depth > 0 && !line.includes('"' + '"')) {
      pending = line;
      continue;
    }
    pending = '';
    const eq = line.indexOf(' = ');
    if (eq < 0) continue;
    current.props.push([line.slice(0, eq), line.slice(eq + 3)]);
  }
  return sections;
}

function headerAttrs(header) {
  const out = {};
  const body = header.replace(/^\[|\]$/g, '');
  const type = body.split(' ')[0];
  out._kind = type;
  const re = /(\w+)=("([^"]*)"|[^\s\]]+(\([^)]*\))?)/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

function loadSections(path) {
  const text = readFileSync(join(root, path), 'utf8');
  const sections = parseResourceFile(text);
  const ctx = { ext: {}, sub: {} };
  for (const sec of sections) {
    const a = headerAttrs(sec.header);
    if (a._kind === 'ext_resource') ctx.ext[a.id] = a.path;
  }
  for (const sec of sections) {
    const a = headerAttrs(sec.header);
    if (a._kind === 'sub_resource') {
      const props = {};
      for (const [k, v] of sec.props) props[k] = parseValue(v, ctx);
      ctx.sub[a.id] = { sub: a.type, props };
    }
  }
  return { sections, ctx };
}

// --- Tilemap ------------------------------------------------------------------------

function decodeCells(b64) {
  const buf = Buffer.from(b64, 'base64');
  const cells = [];
  // u16 format, then 12 bytes per cell: i16 x, i16 y, u16 source, u16 ax, u16 ay, u16 alt.
  for (let off = 2; off + 12 <= buf.length; off += 12) {
    const x = buf.readInt16LE(off);
    const y = buf.readInt16LE(off + 2);
    const ax = buf.readUInt16LE(off + 6);
    const ay = buf.readUInt16LE(off + 8);
    cells.push([x, y, ax, ay]);
  }
  return cells;
}

function convertTileset(path) {
  const { sections, ctx } = loadSections(path);
  const out = { texture: null, cells: {} };
  for (const sec of sections) {
    const a = headerAttrs(sec.header);
    if (a._kind === 'sub_resource' && a.type === 'TileSetAtlasSource') {
      for (const [k, v] of sec.props) {
        if (k === 'texture') out.texture = parseValue(v, ctx).res.replace('res://', '');
        const m = /^(\d+):(\d+)\/0\/physics_layer_(\d)\/polygon_(\d+)\/points$/.exec(k);
        if (m) {
          const key = `${m[1]},${m[2]}`;
          const cell = (out.cells[key] ??= {});
          const layer = m[3] === '0' ? 'solid' : 'top';
          (cell[layer] ??= []).push(parseValue(v, ctx).v2s);
        }
      }
    }
  }
  return out;
}

// --- Scene --------------------------------------------------------------------------

function convertScene(path) {
  const { sections, ctx } = loadSections(path);
  const nodes = [];
  for (const sec of sections) {
    const a = headerAttrs(sec.header);
    if (a._kind !== 'node') continue;
    const node = { name: a.name, parent: a.parent ?? null, type: a.type ?? null, props: {} };
    if (a.instance) {
      const id = /ExtResource\("([^"]+)"\)/.exec(a.instance)?.[1];
      node.scene = ctx.ext[id];
    }
    if (a.groups) node.groups = parseValue(a.groups, ctx);
    for (const [k, v] of sec.props) {
      if (k === 'script') {
        node.script = parseValue(v, ctx).res;
        continue;
      }
      if (k === 'tile_map_data') {
        node.cells = decodeCells(parseValue(v, ctx).bytes);
        continue;
      }
      node.props[k] = parseValue(v, ctx);
    }
    nodes.push(node);
  }
  return { source: path, nodes };
}

mkdirSync(join(outDir, 'tilesets'), { recursive: true });
const tilesDir = join(root, 'levels/common/tiles');
for (const file of readdirSync(tilesDir)) {
  if (!file.endsWith('_tiles.tres')) continue;
  const id = file.replace('_tiles.tres', '');
  const data = convertTileset(relative(root, join(tilesDir, file)));
  writeFileSync(join(outDir, 'tilesets', `${id}.json`), JSON.stringify(data));
  console.log(`tileset ${id}: ${Object.keys(data.cells).length} cells`);
}
for (const level of LEVELS) {
  if (!existsSync(join(root, level))) continue;
  const data = convertScene(level);
  const rel = level.replace(/^levels\//, '').replace(/^playground\//, 'playground/').replace(/\.tscn$/, '.json');
  const dest = join(outDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(data));
  const cells = data.nodes.reduce((n, x) => n + (x.cells?.length ?? 0), 0);
  console.log(`${level}: ${data.nodes.length} nodes, ${cells} tiles -> ${relative(root, dest)}`);
}
