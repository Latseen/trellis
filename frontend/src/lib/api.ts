const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface Factor {
  name: string;
  score: number; // 0=red, 1=yellow, 2=green
  label: string;
  explanation: string;
}

export interface GreenRoofScore {
  overall: number;
  rating: string;
  factors: Factor[];
  notes: string[];
}

export interface Building {
  bbl: string;
  address: string;
  borough: string;
  zip_code: string;
  year_built: number | null;
  num_floors: number | null;
  building_class: string;
  lot_area: number | null;
  bld_area: number | null;
  zoning_district: string;
  land_use: string;
  owner_name: string;
  condo_flag: boolean;
}

export interface ScoreResponse {
  address: string;
  location: { lat: number; lng: number };
  building: Building;
  green_roof: GreenRoofScore;
}

export async function scoreAddress(address: string): Promise<ScoreResponse> {
  const res = await fetch(`${API_BASE}/api/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}
