// Three.js isometric building renderer using real GeoJSON footprint geometry.
//
// Rendering priority:
//   1. OSM building:part sections — real 3D geometry from the OSM community,
//      giving accurate setbacks / crowns for any building they've modelled.
//   2. Plain extrusion of the_geom — works perfectly for buildings with a
//      distinctive footprint (Flatiron, etc.) that OSM hasn't modelled in 3D.
//   3. Rectangular fallback from PLUTO area data.

import * as THREE from 'three';
import type { Building, OsmPart } from './api';

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

// Returns [wallColor, roofColor] as hex numbers
function getBuildingColors(cls: string, era: Era): [number, number] {
  const prefix = (cls ?? '').charAt(0).toUpperCase();

  // D — elevator apartments (brick / terra cotta)
  if (prefix === 'D') {
    if (era === 'gilded') return [0x8b4a32, 0x6b3020];
    if (era === 'prewar') return [0xa05830, 0x7a3820];
    if (era === 'artdeco') return [0xb06040, 0x8a4430];
    if (era === 'postwar') return [0x907870, 0x706050];
    return [0x8090a0, 0x607080];
  }

  // R — row houses, brownstones, small residential
  if (prefix === 'R') {
    if (era === 'gilded') return [0x7a5535, 0x5a3820];
    if (era === 'prewar') return [0x9a7850, 0x7a5830];
    if (era === 'artdeco') return [0xb09060, 0x907040];
    if (era === 'postwar') return [0xa09078, 0x807058];
    return [0x98a8a0, 0x788890];
  }

  // O — offices
  if (prefix === 'O') {
    if (era === 'gilded') return [0x9a9070, 0x7a7050];
    if (era === 'prewar') return [0xb0a080, 0x908060];
    if (era === 'artdeco') return [0xb8a870, 0x907840];
    if (era === 'postwar') return [0x6880a0, 0x485878];
    return [0x708898, 0x506070];
  }

  // H — hotels
  if (prefix === 'H') {
    if (era === 'gilded') return [0x8878a0, 0x685878];
    if (era === 'prewar') return [0x9080b0, 0x706090];
    if (era === 'artdeco') return [0xa090b8, 0x8070a0];
    if (era === 'postwar') return [0x7888a8, 0x586880];
    return [0x8090a8, 0x607080];
  }

  // C — retail / commercial
  if (prefix === 'C') {
    if (era === 'gilded') return [0xa06040, 0x804020];
    if (era === 'prewar') return [0xb07050, 0x905030];
    if (era === 'artdeco') return [0xc08058, 0xa06038];
    if (era === 'postwar') return [0xb09080, 0x907060];
    return [0x909898, 0x707878];
  }

  // S — mixed use
  if (prefix === 'S') {
    if (era === 'gilded') return [0x9a8840, 0x786820];
    if (era === 'prewar') return [0xb09840, 0x907820];
    if (era === 'artdeco') return [0xc0a848, 0xa08828];
    if (era === 'postwar') return [0xb0a070, 0x908050];
    return [0x909888, 0x707868];
  }

  // L — loft / warehouse
  if (prefix === 'L') {
    if (era === 'gilded') return [0x6a5040, 0x4a3020];
    if (era === 'prewar') return [0x8a6848, 0x6a4828];
    if (era === 'artdeco') return [0xa08060, 0x806040];
    if (era === 'postwar') return [0x909090, 0x707070];
    return [0x808898, 0x606870];
  }

  // F — factory / industrial
  if (prefix === 'F') return [0x909898, 0x707878];

  // K/G — garages
  if (prefix === 'K' || prefix === 'G') return [0x888888, 0x686868];

  return [0x9aabb8, 0x7888a0];
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
// cx/cy: WGS84 reference point to project relative to.
function footprintToLocalFt(geom: GeoJSONGeom, cx: number, cy: number): [number, number][] {
  let outerRing: Ring;
  if (geom.type === 'Polygon') {
    outerRing = geom.coordinates[0];
  } else {
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

  const local = ringToLocalFt(outerRing, cx, cy) as [number, number][];
  if (signedArea2D(local) < 0) local.reverse();
  return local;
}

// Compute the WGS84 bounding-box center of the main footprint.
function geomCenter(geom: GeoJSONGeom): [number, number] {
  const outerRing = geom.type === 'Polygon'
    ? geom.coordinates[0]
    : geom.coordinates.map(p => p[0]).sort((a, b) => {
        const bboxArea = (r: Ring) => {
          const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
          return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        };
        return bboxArea(b) - bboxArea(a);
      })[0];
  return bboxCenter(outerRing);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function ringToShape(ring: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1]);
  shape.closePath();
  return shape;
}

function extrudedMesh(shape: THREE.Shape, depth: number, mat: THREE.Material, yBase: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yBase, 0);
  return new THREE.Mesh(geo, mat);
}

function roofCapMesh(shape: THREE.Shape, mat: THREE.Material, yTop: number): THREE.Mesh {
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yTop, 0);
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// OSM building:part renderer
// ---------------------------------------------------------------------------
//
// Each part carries its own footprint polygon plus absolute min_height / height
// values (in feet).  We project every part relative to the same WGS84 centre
// so they all line up correctly, then extrude from min_height to height.
//
// Parts are filtered to those whose WGS84 centroid falls within the main
// building's bounding box (expanded 20 %) to discard neighbouring buildings
// that slipped in via the proximity fallback query.

function wgs84BBox(geom: GeoJSONGeom): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

function partCentroid(part: OsmPart): [number, number] {
  const coords = part.geometry.coordinates[0];
  const lng = coords.reduce((s, p) => s + p[0], 0) / coords.length;
  const lat = coords.reduce((s, p) => s + p[1], 0) / coords.length;
  return [lng, lat];
}

function filterPartsToBuilding(parts: OsmPart[], mainGeom: GeoJSONGeom): OsmPart[] {
  const bb = wgs84BBox(mainGeom);
  // Expand by 20 % to be generous with parts that slightly overhang the footprint
  const dLng = (bb.maxLng - bb.minLng) * 0.2;
  const dLat = (bb.maxLat - bb.minLat) * 0.2;
  return parts.filter(p => {
    const [lng, lat] = partCentroid(p);
    return lng >= bb.minLng - dLng && lng <= bb.maxLng + dLng
        && lat >= bb.minLat - dLat && lat <= bb.maxLat + dLat;
  });
}

function buildOsmPartMeshes(
  parts: OsmPart[],
  mainGeom: GeoJSONGeom,
  cx: number,
  cy: number,
  footprintScale: number,
  wallMat: THREE.Material,
  roofMat: THREE.Material,
  edgeMat: THREE.LineBasicMaterial,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];

  const filtered = filterPartsToBuilding(parts, mainGeom);

  for (const part of filtered) {
    if (!part.height_ft) continue;

    const ring = footprintToLocalFt(part.geometry as GeoJSONGeom, cx, cy);
    const scaledShape = new THREE.Shape(
      ring.map(([x, y]) => new THREE.Vector2(x * footprintScale, y * footprintScale))
    );

    const yBase = part.min_height_ft * footprintScale;
    const depth = (part.height_ft - part.min_height_ft) * footprintScale;
    if (depth <= 0) continue;

    // Solid wall + roof cap
    objects.push(extrudedMesh(scaledShape, depth, wallMat, yBase));
    objects.push(roofCapMesh(scaledShape, roofMat, yBase + depth));

    // Edge lines — trace the top perimeter of each part so step boundaries
    // read as crisp architectural setback lines rather than blurry block seams
    const pts2d = scaledShape.getPoints();
    const edgePts = pts2d.map(p => new THREE.Vector3(p.x, yBase + depth, p.y));
    edgePts.push(edgePts[0]); // close the loop
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    objects.push(new THREE.Line(edgeGeo, edgeMat));
  }

  return objects;
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
  const viewSize = 200;
  const camera = new THREE.OrthographicCamera(
    -viewSize * aspect, viewSize * aspect,
    viewSize, -viewSize,
    -2000, 2000,
  );
  const camDist = 500;
  camera.position.set(camDist, camDist, camDist);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 1, 0);

  // ------------------------------------------------------------------
  // Scene & lights
  // ------------------------------------------------------------------
  const scene = new THREE.Scene();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const dirLight = new THREE.DirectionalLight(0xfff8e8, 1.1);
  dirLight.position.set(300, 500, 200);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xdde8ff, 0.35);
  fillLight.position.set(-200, 300, -300);
  scene.add(fillLight);

  // ------------------------------------------------------------------
  // Materials
  // ------------------------------------------------------------------
  const era = getEra(building.year_built);
  const [wallHex, roofHex] = getBuildingColors(building.building_class, era);

  const wallMat = new THREE.MeshLambertMaterial({ color: wallHex });
  const roofMat = new THREE.MeshLambertMaterial({
    color: roofHex,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  // Edge lines drawn on top of each part's roof perimeter — a slightly darker
  // tint of the wall colour so setback boundaries read as architectural lines.
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(wallHex).multiplyScalar(0.55),
    linewidth: 1,
  });

  // ------------------------------------------------------------------
  // Build geometry
  // ------------------------------------------------------------------
  const heightFt = building.height_ft ?? Math.max(12, (building.num_floors ?? 4) * 12);
  let footprintScale = 1;
  const bodyMeshes: THREE.Object3D[] = [];

  if (building.the_geom) {
    const geom = building.the_geom as GeoJSONGeom;
    const [cx, cy] = geomCenter(geom);
    const outerRing = footprintToLocalFt(geom, cx, cy);

    // Derive scale from the main footprint bounding box
    const xs = outerRing.map(p => p[0]);
    const ys = outerRing.map(p => p[1]);
    const maxDim = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    footprintScale = maxDim > 0 ? (viewSize * 0.7) / maxDim : 1;

    if (building.osm_parts?.length > 0) {
      // OSM 3D parts — real geometry, no hardcoding
      bodyMeshes.push(...buildOsmPartMeshes(building.osm_parts, geom, cx, cy, footprintScale, wallMat, roofMat, edgeMat));
    } else {
      // Plain extrusion — correct for most buildings, great for distinctive footprints
      const shape = ringToShape(outerRing);
      const scaledShape = new THREE.Shape(
        shape.getPoints().map(p => new THREE.Vector2(p.x * footprintScale, p.y * footprintScale))
      );
      bodyMeshes.push(extrudedMesh(scaledShape, heightFt * footprintScale, wallMat, 0));
      bodyMeshes.push(roofCapMesh(scaledShape, roofMat, heightFt * footprintScale));
    }
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

    const scaledShape = new THREE.Shape(
      shape.getPoints().map(p => new THREE.Vector2(p.x * footprintScale, p.y * footprintScale))
    );
    bodyMeshes.push(extrudedMesh(scaledShape, heightFt * footprintScale, wallMat, 0));
    bodyMeshes.push(roofCapMesh(scaledShape, roofMat, heightFt * footprintScale));
  }

  const buildingGroup = new THREE.Group();
  for (const m of bodyMeshes) buildingGroup.add(m);

  // ------------------------------------------------------------------
  // Green roof overlay (score-based)
  // ------------------------------------------------------------------
  if (score > 25 && building.the_geom) {
    const coverage = Math.min((score - 25) / 75, 1);
    const geom = building.the_geom as GeoJSONGeom;
    const [cx, cy] = geomCenter(geom);
    const outerRing = footprintToLocalFt(geom, cx, cy);

    const greenShape = new THREE.Shape(
      outerRing.map(([x, y]) => new THREE.Vector2(x * footprintScale * coverage, y * footprintScale * coverage))
    );

    const greenGeo = new THREE.ShapeGeometry(greenShape);
    greenGeo.rotateX(-Math.PI / 2);
    greenGeo.translate(0, heightFt * footprintScale + 0.5, 0);

    const greenMat = new THREE.MeshLambertMaterial({
      color: 0x4a9a28,
      transparent: true,
      opacity: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
    });
    buildingGroup.add(new THREE.Mesh(greenGeo, greenMat));
  }

  scene.add(buildingGroup);

  // ------------------------------------------------------------------
  // Refit camera to actual rendered building extents
  // ------------------------------------------------------------------
  const renderedHeight = heightFt * footprintScale;
  const centerY = renderedHeight / 2;
  const neededHalf = Math.max(viewSize, centerY * 1.25);

  camera.top = neededHalf;
  camera.bottom = -neededHalf;
  camera.left = -neededHalf * aspect;
  camera.right = neededHalf * aspect;
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
    buildingGroup.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    renderer.dispose();
  }

  return { cleanup };
}
