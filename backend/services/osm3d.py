"""Fetch 3D building-part geometry from OpenStreetMap via the Overpass API.

Strategy (two-stage query to avoid picking up neighbouring buildings):

1. Relation-based: find the `type=building` relation at the point, then
   collect only the `building:part` ways that are members of that relation.
   This is the precise query — it returns exactly the parts of *this* building.

2. Proximity fallback: if no relation exists (many buildings aren't structured
   that way), fall back to a tighter 35 m radius query and let the frontend
   filter by footprint bounding-box.

Returns [] on any failure so the frontend falls back gracefully to a plain
extrusion of the main footprint.
"""

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_M_TO_FT = 3.28084
_LEVELS_TO_M = 3.0


def _parse_height(value: str | None) -> float | None:
    if not value:
        return None
    v = value.strip()
    if v.endswith("ft"):
        try:
            return float(v[:-2].strip()) / _M_TO_FT
        except ValueError:
            return None
    try:
        return float(v.replace("m", "").strip())
    except ValueError:
        return None


def _way_to_part(element: dict) -> dict | None:
    nodes = element.get("geometry", [])
    if len(nodes) < 3:
        return None

    tags = element.get("tags", {})

    coords = [[n["lon"], n["lat"]] for n in nodes]
    if coords[0] != coords[-1]:
        coords.append(coords[0])

    height_m = _parse_height(tags.get("height"))
    if height_m is None:
        levels = tags.get("building:levels") or tags.get("levels")
        try:
            height_m = float(levels) * _LEVELS_TO_M if levels else None
        except ValueError:
            height_m = None

    min_height_m = _parse_height(tags.get("min_height")) or 0.0

    return {
        "geometry": {"type": "Polygon", "coordinates": [coords]},
        "height_ft": round(height_m * _M_TO_FT, 1) if height_m is not None else None,
        "min_height_ft": round(min_height_m * _M_TO_FT, 1),
    }


async def _run_overpass(query: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.post(OVERPASS_URL, content=query)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    parts = []
    for element in data.get("elements", []):
        if element.get("type") != "way":
            continue
        part = _way_to_part(element)
        if part:
            parts.append(part)
    return parts


async def fetch_building_parts(lat: float, lng: float) -> list[dict]:
    # Stage 1: relation-based — only parts belonging to this building's relation
    relation_query = f"""
[out:json][timeout:12];
relation["building"](around:30,{lat},{lng})->.b;
way(r.b)["building:part"]->.parts;
.parts out body geom;
""".strip()

    parts = await _run_overpass(relation_query)
    if parts:
        return parts

    # Stage 2: proximity fallback with tighter radius
    proximity_query = f"""
[out:json][timeout:12];
(way["building:part"](around:35,{lat},{lng}););
out body geom;
""".strip()

    return await _run_overpass(proximity_query)
