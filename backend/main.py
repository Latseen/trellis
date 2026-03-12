from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dataclasses import asdict

from services.geocoder import geocode_address
from services.pluto import get_building
from services.scorer import score_green_roof

app = FastAPI(title="Trellis API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScoreRequest(BaseModel):
    address: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/score")
async def score_address(req: ScoreRequest):
    # 1. Geocode
    try:
        geo = await geocode_address(req.address)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # 2. Fetch PLUTO
    try:
        building = await get_building(geo["bbl"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # 3. Score
    result = score_green_roof(building)

    return {
        "address": geo["address"],
        "location": {"lat": geo["lat"], "lng": geo["lng"]},
        "building": building,
        "green_roof": asdict(result),
    }
