'use client';

import { useEffect, useRef } from 'react';
import { drawBuilding, type BuildingData } from '@/lib/isometric';

interface Props {
  building: BuildingData;
  score: number;
}

const CW = 400;
const CH = 300;

export default function BuildingViewer({ building, score }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBuilding(ctx, building, score, CW, CH);
  }, [building, score]);

  return (
    <canvas
      ref={ref}
      width={CW}
      height={CH}
      style={{ imageRendering: 'pixelated' }}
      className="w-full h-auto max-w-sm"
    />
  );
}
