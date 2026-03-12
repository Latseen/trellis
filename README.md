# Trellis

Green roof and living wall suitability checker for NYC buildings.

Enter an address and get a suitability score with a factor-by-factor breakdown — roof area, structural risk, sun exposure, and more.

## Project Structure

```
trellis/
  backend/    # FastAPI — scoring API, PLUTO + geocoding integration
  frontend/   # Next.js — map interface and score display
```

## Stack

- **Backend**: Python, FastAPI, NYC Open Data (PLUTO), NYC Planning Labs GeoSearch
- **Frontend**: Next.js, Tailwind CSS, Mapbox GL JS
- **Hosting**: TBD (Railway or Fly.io)

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at `http://localhost:3000`.

## API

### `POST /api/score`

```json
{ "address": "30 Rockefeller Plaza, New York" }
```

Returns a green roof suitability score with per-factor breakdown.
