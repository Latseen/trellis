'use client';

import { useState, type FormEvent } from 'react';

interface Props {
  onSearch: (address: string) => void;
  loading: boolean;
}

export default function AddressSearch({ onSearch, loading }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-xl">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Enter a NYC address…"
        className="flex-1 px-4 py-2.5 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500 font-mono text-sm bg-white"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-5 py-2.5 bg-green-700 text-white rounded-lg font-mono font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors"
      >
        {loading ? '···' : 'Check'}
      </button>
    </form>
  );
}
