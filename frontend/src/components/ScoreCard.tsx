import type { GreenRoofScore } from '@/lib/api';

const DOT: Record<number, string> = {
  0: 'bg-red-400',
  1: 'bg-yellow-400',
  2: 'bg-green-500',
};

function scoreColor(overall: number) {
  if (overall >= 75) return 'text-green-600';
  if (overall >= 50) return 'text-yellow-600';
  if (overall >= 25) return 'text-orange-500';
  return 'text-red-500';
}

export default function ScoreCard({ score }: { score: GreenRoofScore }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Overall score */}
      <div className="flex items-end gap-3">
        <span className={`text-6xl font-bold font-mono leading-none ${scoreColor(score.overall)}`}>
          {score.overall}
        </span>
        <div className="pb-1">
          <div className="text-base font-semibold text-gray-800">{score.rating}</div>
          <div className="text-xs text-gray-400 font-mono">/ 100</div>
        </div>
      </div>

      {/* Factor list */}
      <div className="flex flex-col gap-3">
        {score.factors.map((f) => (
          <div key={f.name} className="flex items-start gap-2.5">
            <span
              className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[f.score] ?? 'bg-gray-400'}`}
            />
            <div>
              <div className="text-sm font-semibold text-gray-700">
                {f.name}
                <span className="font-normal text-gray-500"> — {f.label}</span>
              </div>
              <div className="text-xs text-gray-400 leading-snug mt-0.5">{f.explanation}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {score.notes.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-1">
          {score.notes.map((n, i) => (
            <p key={i} className="text-xs text-gray-400 italic">{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}
