'use client';

import { useState } from 'react';
import AddressSearch from '@/components/AddressSearch';
import BuildingViewer from '@/components/BuildingViewer';
import ScoreCard from '@/components/ScoreCard';
import { scoreAddress, type ScoreResponse } from '@/lib/api';

export default function Home() {
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(address: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await scoreAddress(address);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef3ee] flex flex-col items-center py-14 px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-5xl font-bold font-mono text-green-800 tracking-tight">
          TRELLIS
        </h1>
        <p className="text-sm text-green-700 mt-2 font-mono">
          green roof suitability for NYC buildings
        </p>
      </div>

      {/* Search */}
      <AddressSearch onSearch={handleSearch} loading={loading} />

      {/* Famous buildings */}
      {!result && !loading && (
        <div className="mt-6 w-full max-w-xl">
          <p className="text-[10px] font-mono text-green-600 uppercase tracking-widest mb-2">
            Try a famous building
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Empire State Building', address: '350 5th Ave, New York, NY 10118' },
              { label: 'Chrysler Building', address: '405 Lexington Ave, New York, NY 10174' },
              { label: 'Flatiron Building', address: '175 5th Ave, New York, NY 10010' },
              { label: 'One World Trade', address: '285 Fulton St, New York, NY 10007' },
              { label: 'Rockefeller Center', address: '30 Rockefeller Plaza, New York, NY 10112' },
              { label: 'The Plaza Hotel', address: '768 5th Ave, New York, NY 10019' },
              { label: 'Grand Central Terminal', address: '89 E 42nd St, New York, NY 10017' },
              { label: 'UN Headquarters', address: '405 E 42nd St, New York, NY 10017' },
            ].map(({ label, address }) => (
              <button
                key={label}
                onClick={() => handleSearch(address)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-mono bg-white border border-green-200 text-green-800 rounded-full hover:bg-green-50 hover:border-green-400 transition-colors disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-xl w-full font-mono">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-10 w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
          {/* Address bar */}
          <div className="px-6 py-3 bg-green-50 border-b border-green-100">
            <p className="text-[10px] text-green-500 font-mono uppercase tracking-widest">Result for</p>
            <p className="font-semibold text-green-900 text-sm mt-0.5">{result.address}</p>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Pixel building */}
            <div className="flex-1 flex items-center justify-center p-8 bg-[#f2f7f0]">
              <BuildingViewer
                building={result.building}
                score={result.green_roof.overall}
              />
            </div>

            {/* Score breakdown */}
            <div className="md:w-80 p-6 border-t md:border-t-0 md:border-l border-green-100">
              <ScoreCard score={result.green_roof} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
