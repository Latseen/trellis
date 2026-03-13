// Isometric building renderer using raw Canvas 2D.
//
// Coordinate system:
//   World X (tile units) → screen right-down (SE direction)
//   World Y (tile units) → screen left-down  (SW direction)
//   World Z (pixels)     → screen up
//
// Projection:
//   screenX = ox + (wx - wy) * TW/2
//   screenY = oy + (wx + wy) * TH/2 - wz
//
// Visible faces of a box at (0,0,0)→(W,D,H):
//   East face  (x=W plane) — right wall
//   South face (y=D plane) — left wall
//   Top face   (z=H plane) — roof

const TW = 48; // isometric tile width in pixels
const TH = 24; // isometric tile height in pixels (TW/2 = true isometric)

interface Pt {
  x: number;
  y: number;
}

function iso(wx: number, wy: number, wz: number, ox: number, oy: number): Pt {
  return {
    x: Math.round(ox + (wx - wy) * TW / 2),
    y: Math.round(oy + (wx + wy) * TH / 2 - wz),
  };
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, stroke = '#111') {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Color palette [top, east face, south face] by building class prefix.
// Top is lightest (lit from above), south is darkest.
const PALETTES: Record<string, readonly [string, string, string]> = {
  D: ['#c87050', '#a05030', '#703020'], // elevator apartments — brick red
  R: ['#d4a860', '#b08040', '#806020'], // residential — tan/sandstone
  H: ['#9090c8', '#6868a8', '#484878'], // hotels — lavender-gray
  O: ['#88a8c0', '#6080a0', '#405870'], // offices — steel blue
  C: ['#78a870', '#509850', '#307030'], // retail — olive green
  K: ['#909090', '#707070', '#505050'], // garages — neutral gray
  L: ['#b09870', '#907850', '#685830'], // loft/warehouse — warm brown
  S: ['#c8b060', '#a09040', '#786820'], // mixed use — gold
  F: ['#a0a0a8', '#808088', '#606068'], // factory — cool concrete
  G: ['#888888', '#686868', '#484848'], // garage — dark gray
};

function palette(cls: string): readonly [string, string, string] {
  const key = (cls ?? '').charAt(0).toUpperCase();
  return PALETTES[key] ?? ['#a0b0c0', '#7890a8', '#506880'];
}

export interface BuildingData {
  lot_area: number | null;
  num_floors: number | null;
  building_class: string;
}

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  bld: BuildingData,
  score: number,
  cw: number,
  ch: number,
) {
  ctx.clearRect(0, 0, cw, ch);

  // Derive building dimensions from PLUTO data
  const lotArea = bld.lot_area ?? 2000;
  const floors = bld.num_floors ?? 4;

  // Footprint in tile units: width 2–6, depth a bit smaller
  const W = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(lotArea) / 12)));
  const D = Math.max(2, Math.min(W, Math.ceil(W * 0.75)));

  // Height in screen pixels: taller buildings scale up but are capped
  const H = Math.min(30 + Math.floor(floors) * 7, 160);

  // Origin: centers the building on the canvas
  const ox = cw / 2 + (D - W) * TW / 4;
  const oy = ch / 2 + H / 2 - (W + D) * TH / 4;

  const v = (wx: number, wy: number, wz: number) => iso(wx, wy, wz, ox, oy);
  const [colTop, colEast, colSouth] = palette(bld.building_class);

  // Drop shadow on the ground plane
  ctx.save();
  ctx.globalAlpha = 0.18;
  poly(ctx, [v(0, 0, 0), v(W, 0, 0), v(W, D, 0), v(0, D, 0)], '#001100', 'transparent');
  ctx.restore();

  // East face: x=W plane — corners go (W,0,H)→(W,0,0)→(W,D,0)→(W,D,H)
  poly(ctx, [v(W, 0, H), v(W, 0, 0), v(W, D, 0), v(W, D, H)], colEast);

  // South face: y=D plane — corners go (0,D,H)→(0,D,0)→(W,D,0)→(W,D,H)
  poly(ctx, [v(0, D, H), v(0, D, 0), v(W, D, 0), v(W, D, H)], colSouth);

  // Roof: z=H plane
  poly(ctx, [v(0, 0, H), v(W, 0, H), v(W, D, H), v(0, D, H)], colTop);

  // Windows on both visible faces
  drawWindows(ctx, 'east', W, D, H, floors, ox, oy);
  drawWindows(ctx, 'south', W, D, H, floors, ox, oy);

  // Rooftop greenery scaled to score
  if (score > 25) {
    drawRoofGreen(ctx, W, D, H, score, v);
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  face: 'east' | 'south',
  W: number,
  D: number,
  H: number,
  floors: number,
  ox: number,
  oy: number,
) {
  const floorCount = Math.max(Math.floor(floors), 1);
  const floorH = H / floorCount;
  const winH = Math.max(3, floorH * 0.35);
  const winStart = floorH * 0.28;

  // How many window columns fit along this face
  const faceLen = face === 'east' ? D : W;
  const cols = Math.max(1, Math.floor(faceLen * 2));
  const step = faceLen / (cols + 1);
  const winW = Math.min(0.28, step * 0.5); // window tile width

  for (let f = 0; f < floorCount; f++) {
    const wz = f * floorH + winStart;
    for (let c = 1; c <= cols; c++) {
      const pos = c * step;
      const lit = ((f * 3 + c * 5) % 7) !== 0;
      const color = lit ? '#ffd870' : '#1a1a2a';

      let pts: Pt[];
      if (face === 'east') {
        pts = [
          iso(W, pos, wz + winH, ox, oy),
          iso(W, pos + winW, wz + winH, ox, oy),
          iso(W, pos + winW, wz, ox, oy),
          iso(W, pos, wz, ox, oy),
        ];
      } else {
        pts = [
          iso(pos, D, wz + winH, ox, oy),
          iso(pos + winW, D, wz + winH, ox, oy),
          iso(pos + winW, D, wz, ox, oy),
          iso(pos, D, wz, ox, oy),
        ];
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

function drawRoofGreen(
  ctx: CanvasRenderingContext2D,
  W: number,
  D: number,
  H: number,
  score: number,
  v: (wx: number, wy: number, wz: number) => Pt,
) {
  const coverage = (score - 25) / 75; // 0→1 over score range 25–100
  const gridX = W * 2;
  const gridY = D * 2;
  const total = gridX * gridY;
  const count = Math.round(coverage * total);
  const greens = ['#58a83a', '#3d8a20', '#7cc848'] as const;

  for (let gx = 0; gx < gridX; gx++) {
    for (let gy = 0; gy < gridY; gy++) {
      // Deterministic selection: each cell gets a value 0..(total-1)
      const hash = (gx * 7 + gy * 11 + 3) % total;
      if (hash >= count) continue;

      const wx = gx * 0.5;
      const wy = gy * 0.5;
      const color = greens[(gx + gy) % 3];

      ctx.beginPath();
      const p = [v(wx, wy, H), v(wx + 0.5, wy, H), v(wx + 0.5, wy + 0.5, H), v(wx, wy + 0.5, H)];
      ctx.moveTo(p[0].x, p[0].y);
      p.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#2a6a10';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
}
