class_name Layers
## Collision layer bits, mirroring the table in docs/CONTRACTS.md. Use these
## instead of literal numbers so a layer change happens in one place.

const TERRAIN_SOLID := 1 << 0
const TERRAIN_PATH_A := 1 << 1
const TERRAIN_PATH_B := 1 << 2
const TERRAIN_TOP_ONLY := 1 << 3
const PLAYER := 1 << 4
const ENEMIES := 1 << 5
const OBJECTS := 1 << 6
const HAZARDS := 1 << 7
const BOSS := 1 << 8
