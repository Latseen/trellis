'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';

interface Props {
  onSearch: (address: string) => void;
  loading: boolean;
}

const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/search';

export default function AddressSearch({ onSearch, loading }: Props) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${GEOSEARCH_URL}?text=${encodeURIComponent(value)}&size=6`
        );
        const data = await res.json();
        const labels: string[] = (data.features ?? []).map(
          (f: { properties: { label: string } }) => f.properties.label
        );
        setSuggestions(labels);
        setOpen(labels.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectSuggestion(label: string) {
    setValue(label);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    onSearch(label);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      setOpen(false);
      onSearch(trimmed);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex gap-2 w-full">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Enter a NYC address…"
          className="flex-1 px-4 py-2.5 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500 font-mono text-sm bg-white"
          disabled={loading}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="px-5 py-2.5 bg-green-700 text-white rounded-lg font-mono font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors"
        >
          {loading ? '···' : 'Check'}
        </button>
      </form>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full bg-white border border-green-200 rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((label, i) => (
            <li
              key={label}
              id={`suggestion-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => selectSuggestion(label)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2.5 font-mono text-sm cursor-pointer ${
                i === activeIndex
                  ? 'bg-green-100 text-green-900'
                  : 'text-gray-800 hover:bg-green-50'
              }`}
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
