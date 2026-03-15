// Three.js isometric building renderer using real GeoJSON footprint geometry.
//
// Footprint (the_geom, WGS84) is projected to local feet, extruded to height_ft,
// and rendered with an OrthographicCamera at a true isometric angle.
//
// Era and building-class-based materials are applied to walls and roof.

import * as THREE from 'three';
import type { Building } from './api';

// ---------------------------------------------------------------------------
// Era classification
// ---------------------------------------------------------------------------

type Era = 'gilded' | 'prewar' | 'artdeco' | 'postwar' | 'modern';

function getEra(yearBuilt: number | null): Era {
  if (yearBuilt === null) return 'postwar';
  if (yearBuilt < 1900) return 'gilded';
  if (yearBuilt < 1920) return 'prewar';
  if (yearBuilt < 1950) return 'artdeco';
  if (yearBuilt < 1980) return 'postwar';
  return 'modern';
}

// Returns [wallColor, roofColor, accentColor] as hex numbers
function getBuildingColors(cls: string, era: Era): [number, number, number] {
  const prefix = (cls ?? '').charAt(0).toUpperCase();

  // D — elevator apartments (brick / terra cotta)
  if (prefix === 'D') {
    if (era === 'gilded') return [0x8b4a32, 0x6b3020, 0xa06040];
    if (era === 'prewar') return [0xa05830, 0x7a3820, 0xb87050];
    if (era === 'artdeco') return [0xb06040, 0x8a4430, 0xc87050];
    if (era === 'postwar') return [0x907870, 0x706050, 0xb09080];
    return [0x8090a0, 0x607080, 0xa0b0c0]; // modern — glass/concrete
  }

  // R — row houses, brownstones, small residential
  if (prefix === 'R') {
    if (era === 'gilded') return [0x7a5535, 0x5a3820, 0x9a7555];
    if (era === 'prewar') return [0x9a7850, 0x7a5830, 0xb89870];
    if (era === 'artdeco') return [0xb09060, 0x907040, 0xc8a870];
    if (era === 'postwar') return [0xa09078, 0x807058, 0xb8a888];
    return [0x98a8a0, 0x788890, 0xb0c0b8];
  }

  // O — offices
  if (prefix === 'O') {
    if (era === 'gilded') return [0x9a9070, 0x7a7050, 0xb8b090]; // limestone
    if (era === 'prewar') return [0xb0a080, 0x908060, 0xc8c0a0]; // limestone/marble
    if (era === 'artdeco') return [0xb8a870, 0x907840, 0xd0c090]; // artdeco limestone
    if (era === 'postwar') return [0x6880a0, 0x485878, 0x8898b8]; // curtain wall
    return [0x708898, 0x506070, 0x90a8b8]; // glass curtain wall
  }

  // H — hotels
  if (prefix === 'H') {
    if (era === 'gilded') return [0x8878a0, 0x685878, 0xa898c0];
    if (era === 'prewar') return [0x9080b0, 0x706090, 0xb0a0c8];
    if (era === 'artdeco') return [0xa090b8, 0x8070a0, 0xc0b0d0];
    if (era === 'postwar') return [0x7888a8, 0x586880, 0x98a8c0];
    return [0x8090a8, 0x607080, 0xa0b0c0];
  }

  // C — retail / commercial
  if (prefix === 'C') {
    if (era === 'gilded') return [0xa06040, 0x804020, 0xc08060]; // dark brick
    if (era === 'prewar') return [0xb07050, 0x905030, 0xc89070];
    if (era === 'artdeco') return [0xc08058, 0xa06038, 0xd8a080]; // terracotta
    if (era === 'postwar') return [0xb09080, 0x907060, 0xc8a898];
    return [0x909898, 0x707878, 0xa8b0b0]; // modern concrete/glass
  }

  // S — mixed use (gold / yellow brick)
  if (prefix === 'S') {
    if (era === 'gilded') return [0x9a8840, 0x786820, 0xb8a860];
    if (era === 'prewar') return [0xb09840, 0x907820, 0xc8b060];
    if (era === 'artdeco') return [0xc0a848, 0xa08828, 0xd8c068];
    if (era === 'postwar') return [0xb0a070, 0x908050, 0xc8b888];
    return [0x909888, 0x707868, 0xa8b0a0];
  }

  // L — loft / warehouse
  if (prefix === 'L') {
    if (era === 'gilded') return [0x6a5040, 0x4a3020, 0x8a7060];
    if (era === 'prewar') return [0x8a6848, 0x6a4828, 0xa08868];
    if (era === 'artdeco') return [0xa08060, 0x806040, 0xb89878];
    if (era === 'postwar') return [0x909090, 0x707070, 0xa8a8a8];
    return [0x808898, 0x606870, 0x9898a8];
  }

  // F — factory / industrial
  if (prefix === 'F') {
    return [0x909898, 0x707878, 0xa8b0b0];
  }

  // K/G — garages
  if (prefix === 'K' || prefix === 'G') {
    return [0x888888, 0x686868, 0xa0a0a0];
  }

  // Default fallback
  return [0x9aabb8, 0x7888a0, 0xb0c0c8];
}

// ---------------------------------------------------------------------------
// GeoJSON → local feet projection
// ---------------------------------------------------------------------------

const FT_PER_DEG_LAT = 364_000;
const NYC_LAT = 40.72;
const FT_PER_DEG_LNG = Math.cos((NYC_LAT * Math.PI) / 180) * 364_000; // ≈85,000

type Ring = [number, number][];

function ringToLocalFt(ring: Ring, cx: number, cy: number): [number, number][] {
  return ring.map(([lng, lat]) => [
    (lng - cx) * FT_PER_DEG_LNG,
    (lat - cy) * FT_PER_DEG_LAT,
  ]);
}

// Signed area > 0 → CCW (correct for Three.js), < 0 → CW (must reverse)
function signedArea2D(pts: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return area / 2;
}

function bboxCenter(ring: Ring): [number, number] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

type GeoJSONGeom =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };

// Returns the outer ring of the footprint as local-ft coords, CCW-wound.
function footprintToLocalFt(geom: GeoJSONGeom): [number, number][] {
  let outerRing: Ring;
  if (geom.type === 'Polygon') {
    outerRing = geom.coordinates[0];
  } else {
    // MultiPolygon: pick the polygon with the largest bounding box area
    const polys = geom.coordinates.map(poly => poly[0]);
    polys.sort((a, b) => {
      const bboxArea = (r: Ring) => {
        const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
        return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      };
      return bboxArea(b) - bboxArea(a);
    });
    outerRing = polys[0];
  }

  const [cx, cy] = bboxCenter(outerRing);
  const local = ringToLocalFt(outerRing, cx, cy) as [number, number][];

  // Ensure CCW winding — Three.js Shape treats CW as a hole
  if (signedArea2D(local) < 0) local.reverse();

  return local;
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

export interface BuildingScene {
  cleanup: () => void;
}

export interface BuildingInput {
  building: Building;
  score: number;
}

export function drawBuilding3d(
  canvas: HTMLCanvasElement,
  { building, score }: BuildingInput,
): BuildingScene {
  // ------------------------------------------------------------------
  // Renderer
  // ------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.clientWidth || 400, canvas.clientHeight || 300);
  renderer.setClearColor(0x000000, 0);

  // ------------------------------------------------------------------
  // Camera — orthographic isometric
  // ------------------------------------------------------------------
  const aspect = (canvas.clientWidth || 400) / (canvas.clientHeight || 300);
  const viewSize = 200; // half-height in feet
  const camera = new THREE.OrthographicCamera(
    -viewSize * aspect, viewSize * aspect,
    viewSize, -viewSize,
    -2000, 2000,
  );
  // True isometric: camera sits at equal x/y/z distance from origin
  const camDist = 500;
  camera.position.set(camDist, camDist, camDist);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 1, 0);

  // ------------------------------------------------------------------
  // Scene & lights
  // ------------------------------------------------------------------
  const scene = new THREE.Scene();

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // Key light from upper-right
  const dirLight = new THREE.DirectionalLight(0xfff8e8, 1.1);
  dirLight.position.set(300, 500, 200);
  scene.add(dirLight);

  // Fill light (softer, from opposite side)
  const fillLight = new THREE.DirectionalLight(0xdde8ff, 0.35);
  fillLight.position.set(-200, 300, -300);
  scene.add(fillLight);

  // ------------------------------------------------------------------
  // Build geometry
  // ------------------------------------------------------------------
  const era = getEra(building.year_built);
  const [wallHex, roofHex] = getBuildingColors(building.building_class, era);

  const wallMat = new THREE.MeshLambertMaterial({ color: wallHex });
  const roofMat = new THREE.MeshLambertMaterial({ color: roofHex });

  const heightFt = building.height_ft ?? Math.max(12, (building.num_floors ?? 4) * 12);

  let wallMesh: THREE.Mesh;
  let roofMesh: THREE.Mesh;
  let footprintScale = 1;

  if (building.the_geom) {
    // Real footprint extrusion
    const outerRing = footprintToLocalFt(building.the_geom as GeoJSONGeom);

    const shape = new THREE.Shape();
    shape.moveTo(outerRing[0][0], outerRing[0][1]);
    for (let i = 1; i < outerRing.length; i++) {
      shape.lineTo(outerRing[i][0], outerRing[i][1]);
    }
    shape.closePath();

    // Scale footprint to fit view (keep height proportional)
    const xs = outerRing.map(p => p[0]);
    const ys = outerRing.map(p => p[1]);
    const bboxW = Math.max(...xs) - Math.min(...xs);
    const bboxD = Math.max(...ys) - Math.min(...ys);
    const maxFootprintDim = Math.max(bboxW, bboxD);
    footprintScale = maxFootprintDim > 0 ? (viewSize * 0.7) / maxFootprintDim : 1;

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: heightFt,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // ExtrudeGeometry places shape in XY plane, extrudes along +Z.
    // Rotate so footprint is in XZ plane (Three.js Y-up) and extrusion goes up along Y.
    geo.rotateX(-Math.PI / 2);
    geo.scale(footprintScale, footprintScale, footprintScale);

    wallMesh = new THREE.Mesh(geo, wallMat);

    // Roof cap: flat shape at the top of the extrusion
    const roofGeo = new THREE.ShapeGeometry(shape);
    roofGeo.rotateX(-Math.PI / 2);
    roofGeo.scale(footprintScale, footprintScale, footprintScale);
    roofGeo.translate(0, heightFt * footprintScale, 0);
    roofMesh = new THREE.Mesh(roofGeo, roofMat);
  } else {
    // Fallback: rectangular box from lot/floor data
    const floorArea = building.bld_area
      ? building.bld_area / Math.max(building.num_floors ?? 1, 1)
      : building.lot_area ?? 3000;
    const side = Math.sqrt(Math.max(floorArea, 400));
    footprintScale = (viewSize * 0.7) / side;

    const shape = new THREE.Shape();
    shape.moveTo(-side / 2, -side / 2);
    shape.lineTo(side / 2, -side / 2);
    shape.lineTo(side / 2, side / 2);
    shape.lineTo(-side / 2, side / 2);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: heightFt, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.scale(footprintScale, footprintScale, footprintScale);
    wallMesh = new THREE.Mesh(geo, wallMat);

    const roofGeo = new THREE.ShapeGeometry(shape);
    roofGeo.rotateX(-Math.PI / 2);
    roofGeo.scale(footprintScale, footprintScale, footprintScale);
    roofGeo.translate(0, heightFt * footprintScale, 0);
    roofMesh = new THREE.Mesh(roofGeo, roofMat);
  }

  // Group all building meshes so rotation is applied together
  const buildingGroup = new THREE.Group();
  buildingGroup.add(wallMesh);
  buildingGroup.add(roofMesh);

  // ------------------------------------------------------------------
  // Green roof overlay (score-based)
  // ------------------------------------------------------------------
  let greenMesh: THREE.Mesh | null = null;
  if (score > 25 && building.the_geom) {
    const coverage = Math.min((score - 25) / 75, 1);
    const outerRing = footprintToLocalFt(building.the_geom as GeoJSONGeom);

    const greenShape = new THREE.Shape();
    greenShape.moveTo(outerRing[0][0], outerRing[0][1]);
    for (let i = 1; i < outerRing.length; i++) {
      greenShape.lineTo(outerRing[i][0], outerRing[i][1]);
    }
    greenShape.closePath();

    // Shrink by (1 - coverage) to represent partial coverage
    const greenGeo = new THREE.ShapeGeometry(greenShape);
    greenGeo.rotateX(-Math.PI / 2);
    greenGeo.scale(
      footprintScale * coverage,
      footprintScale * coverage,
      footprintScale * coverage,
    );
    greenGeo.translate(0, heightFt * footprintScale + 0.5, 0);

    const greenMat = new THREE.MeshLambertMaterial({
      color: 0x4a9a28,
      transparent: true,
      opacity: 0.85,
    });
    greenMesh = new THREE.Mesh(greenGeo, greenMat);
    buildingGroup.add(greenMesh);
  }

  scene.add(buildingGroup);

  // ------------------------------------------------------------------
  // Refit camera to actual rendered building extents
  // ------------------------------------------------------------------
  const renderedHeight = heightFt * footprintScale;
  const centerY = renderedHeight / 2;

  // In isometric view the building's vertical extent projects onto screen Y.
  // Use the larger of footprint half-size or the building's half-height so
  // nothing gets clipped regardless of aspect ratio or building proportions.
  const neededHalf = Math.max(viewSize, centerY * 1.25);
  camera.top = neededHalf;
  camera.bottom = -neededHalf;
  camera.left = -neededHalf * aspect;
  camera.right = neededHalf * aspect;
  // Shift lookAt to vertical center so the building is centered in the frame
  camera.position.set(camDist, camDist + centerY, camDist);
  camera.lookAt(0, centerY, 0);
  camera.updateProjectionMatrix();

  // ------------------------------------------------------------------
  // Rotation animation
  // ------------------------------------------------------------------
  let rafId: number;

  function animate() {
    rafId = requestAnimationFrame(animate);
    buildingGroup.rotation.y += 0.005;
    renderer.render(scene, camera);
  }

  animate();

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  function cleanup() {
    cancelAnimationFrame(rafId);
    wallMesh.geometry.dispose();
    roofMesh.geometry.dispose();
    if (greenMesh) greenMesh.geometry.dispose();
    (wallMesh.material as THREE.Material).dispose();
    (roofMesh.material as THREE.Material).dispose();
    if (greenMesh) (greenMesh.material as THREE.Material).dispose();
    renderer.dispose();
  }

  return { cleanup };
}
