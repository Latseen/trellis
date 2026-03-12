# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Trellis is a green roof / living wall suitability checker for NYC buildings. Users enter an address and receive a 0–100 suitability score with a factor-by-factor breakdown.

## Backend Commands

All commands run from `backend/` with the virtualenv active:

```bash
# Activate virtualenv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run dev server with hot reload
uvicorn main:app --reload
```

No test suite exists yet. To manually exercise the API:
```bash
curl -X POST http://localhost:8000/api/score \
  -H "Content-Type: application/json" \
  -d '{"address": "30 Rockefeller Plaza, New York, NY"}'
```

## Request Flow

Every `POST /api/score` call follows this three-step pipeline:

1. **Geocode** (`services/geocoder.py`) — Sends the address to NYC Planning Labs GeoSearch, returns `lat`, `lng`, and `bbl` (Borough-Block-Lot identifier).
2. **PLUTO lookup** (`services/pluto.py`) — Uses the BBL to fetch building data from the NYC Open Data Socrata API (`year_built`, `num_floors`, `lot_area`, `building_class`, etc.).
3. **Score** (`services/scorer.py`) — Runs `score_green_roof(building)` producing a `SuitabilityScore` dataclass, serialized via `dataclasses.asdict()`.

Both external calls use `httpx.AsyncClient` with a 10-second timeout. Neither requires an API key.

## Scoring Model

Four factors, each scored 0/1/2 (red/yellow/green), normalized to 0–100:

| Factor | PLUTO field | Thresholds |
|---|---|---|
| Roof Area | `lot_area` | ≥5000 sq ft = Good, ≥1500 = Moderate, else Poor |
| Structural Risk | `year_built` | ≥1980 = Good, ≥1940 = Caution, else High Risk |
| Roof Access | `num_floors` | ≤6 = Good, ≤20 = Moderate, else Difficult |
| Building Type | `building_class` prefix | D/H/O/R = Good; C/K/L/S/F/G = Moderate |

Rating bands: ≥75 Excellent, ≥50 Good, ≥25 Fair, else Poor. Living wall scoring is not yet implemented.

## External APIs (No Keys Required for MVP)

- **GeoSearch**: `https://geosearch.planninglabs.nyc/v2/search?text=ADDRESS&size=1`
  - BBL is nested at `feature.properties.addendum.pad.bbl`
- **PLUTO (Socrata)**: `https://data.cityofnewyork.us/resource/64uk-42ks.json?bbl=BBL`
  - Returns an array; always use index 0

## Planned Additions

- **Frontend**: Next.js + Tailwind + Mapbox GL JS (not started)
- **Google Solar API**: sun exposure per rooftop segment
- **NOAA**: historical precipitation data
- **Living wall scoring**: wall orientation, sun hours per facade, freeze-thaw cycles
- **NYC incentive eligibility**: DEP Green Infrastructure Grant zones, CSO zone lookup

When adding a data source that requires an API key, add its name to `backend/.env.example`.
