# Trellis

Green roof and living wall suitability checker for NYC buildings. Enter an address, get a 0–100 score with a factor-by-factor breakdown.

## Stack

- **Backend**: Python, FastAPI, NYC Open Data (PLUTO), NYC Planning Labs GeoSearch
- **Frontend**: Next.js, Tailwind CSS, Mapbox GL JS

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API: `http://localhost:8000` — Docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:3000`

## API

### `POST /api/score`

```json
{ "address": "30 Rockefeller Plaza, New York, NY" }
```

**Response** — a suitability score and per-factor breakdown:

| Factor | Source | Scoring |
|---|---|---|
| Roof Area | `lot_area` | ≥5000 sq ft Good, ≥1500 Moderate, else Poor |
| Structural Risk | `year_built` | ≥1980 Good, ≥1940 Caution, else High Risk |
| Roof Access | `num_floors` | ≤6 Good, ≤20 Moderate, else Difficult |
| Building Type | `building_class` | D/H/O/R Good; C/K/L/S/F/G Moderate |

Each factor is scored 0–2 (red/yellow/green), normalized to 0–100. Rating bands: ≥75 Excellent, ≥50 Good, ≥25 Fair, else Poor.

## Request Flow

1. **Geocode** — address → lat/lng + BBL via NYC Planning Labs GeoSearch
2. **PLUTO lookup** — BBL → building data via NYC Open Data Socrata API
3. **Score** — building data → suitability score

No API keys required.
