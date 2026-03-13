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
