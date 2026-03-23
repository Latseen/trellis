'use client';

import { useEffect, useRef } from 'react';
import { drawBuilding3d, type BuildingScene } from '@/lib/building3d';
import type { Building } from '@/lib/api';

interface Props {
  building: Building;
  score: number;
}

export default function BuildingViewer({ building, score }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BuildingScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = drawBuilding3d(canvas, { building, score });
    sceneRef.current = scene;
    return () => {
      scene.cleanup();
      sceneRef.current = null;
    };
  }, [building, score]);

  // Keep the canvas pixel buffer in sync with its CSS size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        sceneRef.current?.resize(Math.round(width), Math.round(height));
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '300px', display: 'block' }}
      className="max-w-sm"
    />
  );
}
