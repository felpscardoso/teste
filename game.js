'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TILE_W = 64;       // full tile width in pixels
const TILE_H = 32;       // full tile height in pixels (half of width for iso)
const WALL_H = 40;       // visual height of wall faces
const PLAYER_SPEED = 3;  // tiles per second
const PLAYER_RADIUS = 0.35; // collision radius in tile units

// Tile type IDs
const TILE_FLOOR = 0;
const TILE_WALL  = 1;
const TILE_WATER = 2;

// ---------------------------------------------------------------------------
// Map (16×16)  W=wall  F=floor  ~=water
// ---------------------------------------------------------------------------
const MAP_DATA = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,1,1,0,0,0,0,0,0,1,1,0,1],
  [1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,2,2,0,0,0,0,0,0,1,1,1,0,0,1],
  [1,0,2,2,0,0,0,0,0,0,1,1,1,0,0,1],
  [1,0,2,2,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];
const MAP_ROWS = MAP_DATA.length;
const MAP_COLS = MAP_DATA[0].length;

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const camera = { x: 0, y: 0 };

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------
const player = {
  wx: 7.5,    // world X (fractional, centre of tile)
  wy: 7.5,    // world Y
  animTime: 0,
  isMoving: false,
  facing: 'se', // ne | se | sw | nw
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = { up: false, down: false, left: false, right: false };

window.addEventListener('keydown', e => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    keys.up    = true; e.preventDefault(); break;
    case 'KeyS': case 'ArrowDown':  keys.down  = true; e.preventDefault(); break;
    case 'KeyA': case 'ArrowLeft':  keys.left  = true; e.preventDefault(); break;
    case 'KeyD': case 'ArrowRight': keys.right = true; e.preventDefault(); break;
  }
});
window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'KeyW': case 'ArrowUp':    keys.up    = false; break;
    case 'KeyS': case 'ArrowDown':  keys.down  = false; break;
    case 'KeyA': case 'ArrowLeft':  keys.left  = false; break;
    case 'KeyD': case 'ArrowRight': keys.right = false; break;
  }
});

// ---------------------------------------------------------------------------
// Isometric helpers
// ---------------------------------------------------------------------------
function worldToScreen(wx, wy) {
  return {
    sx: (wx - wy) * TILE_W / 2 + camera.x,
    sy: (wx + wy) * TILE_H / 2 + camera.y,
  };
}

function getTile(col, row) {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return TILE_WALL;
  return MAP_DATA[row][col];
}

function isSolid(tile) {
  return tile === TILE_WALL;
}

// ---------------------------------------------------------------------------
// Collision (AABB with tile grid)
// ---------------------------------------------------------------------------
function isPositionBlocked(wx, wy) {
  // Sample the four corners of the player's bounding box
  const r = PLAYER_RADIUS;
  const offsets = [
    [-r, -r], [r, -r], [-r, r], [r, r],
  ];
  for (const [ox, oy] of offsets) {
    const col = Math.floor(wx + ox);
    const row = Math.floor(wy + oy);
    if (isSolid(getTile(col, row))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
let lastTime = null;

function update(timestamp) {
  if (lastTime === null) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50 ms
  lastTime = timestamp;

  // --- Input vector in isometric world space ---
  // In isometric view:
  //   W(up)    → NW in world → wx--, wy--  ≡ screen up-left
  //   S(down)  → SE          → wx++, wy++
  //   A(left)  → SW          → wx--, wy++  ≡ screen down-left  (but iso: left goes SW)
  //   D(right) → NE          → wx++, wy--
  // Actually for standard isometric:
  //   screen-right = wx increases, wy decreases (NE direction)
  //   screen-left  = wx decreases, wy increases (SW direction)
  //   screen-up    = wx decreases, wy decreases (NW direction)
  //   screen-down  = wx increases, wy increases (SE direction)

  let dx = 0, dy = 0;
  if (keys.up)    { dx -= 1; dy -= 1; }
  if (keys.down)  { dx += 1; dy += 1; }
  if (keys.left)  { dx -= 1; dy += 1; }
  if (keys.right) { dx += 1; dy -= 1; }

  // Normalize diagonal
  const len = Math.sqrt(dx * dx + dy * dy);
  player.isMoving = len > 0;

  if (player.isMoving) {
    // Determine facing based on movement direction
    if (dx > 0 && dy > 0)       player.facing = 'se';
    else if (dx < 0 && dy < 0)  player.facing = 'nw';
    else if (dx > 0 && dy < 0)  player.facing = 'ne';
    else if (dx < 0 && dy > 0)  player.facing = 'sw';
    else if (dx > 0)             player.facing = 'se';
    else if (dx < 0)             player.facing = 'nw';
    else if (dy > 0)             player.facing = 'sw';  // actually east but mapped
    else if (dy < 0)             player.facing = 'ne';

    const ndx = dx / len * PLAYER_SPEED * dt;
    const ndy = dy / len * PLAYER_SPEED * dt;

    // Axis-split collision: try X then Y independently
    const newWx = player.wx + ndx;
    if (!isPositionBlocked(newWx, player.wy)) {
      player.wx = newWx;
    }
    const newWy = player.wy + ndy;
    if (!isPositionBlocked(player.wx, newWy)) {
      player.wy = newWy;
    }

    player.animTime += dt;
  }

  // --- Camera: centre player on screen ---
  const ps = worldToScreen(player.wx, player.wy);
  // We want ps.sx == canvas.width/2 and ps.sy == canvas.height/2
  // worldToScreen uses camera.x/y so we solve backwards:
  camera.x = canvas.width  / 2 - (player.wx - player.wy) * TILE_W / 2;
  camera.y = canvas.height / 2 - (player.wx + player.wy) * TILE_H / 2;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
function drawIsoDiamond(sx, sy, fillColor, strokeColor) {
  ctx.beginPath();
  ctx.moveTo(sx,              sy - TILE_H / 2);
  ctx.lineTo(sx + TILE_W / 2, sy);
  ctx.lineTo(sx,              sy + TILE_H / 2);
  ctx.lineTo(sx - TILE_W / 2, sy);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawFloorTile(sx, sy, tileType, animTime) {
  if (tileType === TILE_FLOOR) {
    drawIsoDiamond(sx, sy, '#6aaa40', '#5a9a30');
  } else if (tileType === TILE_WATER) {
    const shimmer = Math.sin(animTime * 2 + sx * 0.05) * 15;
    const g = Math.floor(140 + shimmer);
    drawIsoDiamond(sx, sy, `rgb(30,${g},210)`, '#1a8acc');
    // Small white shimmer highlight
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.1 * Math.sin(animTime * 3 + sy * 0.1);
    drawIsoDiamond(sx, sy - 2, '#ffffff', null);
    ctx.restore();
  }
}

function drawWallTile(sx, sy) {
  // Top face
  drawIsoDiamond(sx, sy - WALL_H, '#90a4ae', '#78909c');

  // Left face (SW)
  ctx.beginPath();
  ctx.moveTo(sx - TILE_W / 2, sy);
  ctx.lineTo(sx,              sy + TILE_H / 2);
  ctx.lineTo(sx,              sy + TILE_H / 2 - WALL_H);
  ctx.lineTo(sx - TILE_W / 2, sy - WALL_H);
  ctx.closePath();
  ctx.fillStyle = '#546e7a';
  ctx.fill();
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right face (SE)
  ctx.beginPath();
  ctx.moveTo(sx + TILE_W / 2, sy);
  ctx.lineTo(sx,              sy + TILE_H / 2);
  ctx.lineTo(sx,              sy + TILE_H / 2 - WALL_H);
  ctx.lineTo(sx + TILE_W / 2, sy - WALL_H);
  ctx.closePath();
  ctx.fillStyle = '#607d8b';
  ctx.fill();
  ctx.strokeStyle = '#37474f';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlayer(sx, sy, animTime, isMoving, facing) {
  const bob = isMoving ? Math.sin(animTime * 8) * 3 : 0;
  const legSwing = isMoving ? Math.sin(animTime * 8) * 5 : 0;
  const armSwing = -legSwing;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 12, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  const baseY = sy - bob;

  // Legs
  ctx.fillStyle = '#37474f';
  // Left leg
  ctx.fillRect(sx - 9, baseY - 4 + legSwing, 7, 14);
  // Right leg
  ctx.fillRect(sx + 2, baseY - 4 - legSwing, 7, 14);

  // Body
  ctx.fillStyle = '#1565c0';
  roundRect(ctx, sx - 11, baseY - 22, 22, 20, 4);
  ctx.fill();

  // Arms
  ctx.fillStyle = '#0d47a1';
  // Left arm
  ctx.fillRect(sx - 17, baseY - 20 + armSwing, 7, 14);
  // Right arm
  ctx.fillRect(sx + 10, baseY - 20 - armSwing, 7, 14);

  // Head
  ctx.fillStyle = '#ffcc80';
  ctx.beginPath();
  ctx.arc(sx, baseY - 30, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e6a010';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes (simple dots facing appropriate direction)
  ctx.fillStyle = '#333';
  const eyeOffsetX = (facing === 'ne' || facing === 'se') ? 2 : -2;
  ctx.beginPath();
  ctx.arc(sx + eyeOffsetX - 3, baseY - 31, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + eyeOffsetX + 3, baseY - 31, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

// Polyfill-safe roundRect helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(timestamp) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#0f0c29');
  bg.addColorStop(1, '#302b63');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Build render list (floor + wall + player), sorted by depth
  const renderList = [];
  const animTime = player.animTime;

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const tile = MAP_DATA[row][col];
      const depth = col + row;
      const { sx, sy } = worldToScreen(col + 0.5, row + 0.5);

      if (tile !== TILE_WALL) {
        renderList.push({ type: 'floor', sx, sy, tile, depth, animTime });
      } else {
        // Draw floor beneath wall first, then wall on top (same tile, floor depth)
        renderList.push({ type: 'floor_under_wall', sx, sy, depth: depth - 0.1 });
        renderList.push({ type: 'wall', sx, sy, depth });
      }
    }
  }

  // Player: depth is its tile position + small offset to render on top of floor
  const playerDepth = player.wx + player.wy + 0.5;
  const ps = worldToScreen(player.wx, player.wy);
  renderList.push({
    type: 'player',
    sx: ps.sx,
    sy: ps.sy,
    depth: playerDepth,
    animTime: player.animTime,
    isMoving: player.isMoving,
    facing: player.facing,
  });

  renderList.sort((a, b) => a.depth - b.depth);

  for (const item of renderList) {
    switch (item.type) {
      case 'floor':
        drawFloorTile(item.sx, item.sy, item.tile, item.animTime);
        break;
      case 'floor_under_wall':
        drawFloorTile(item.sx, item.sy, TILE_FLOOR, 0);
        break;
      case 'wall':
        drawWallTile(item.sx, item.sy);
        break;
      case 'player':
        drawPlayer(item.sx, item.sy, item.animTime, item.isMoving, item.facing);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function loop(timestamp) {
  update(timestamp);
  render(timestamp);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
