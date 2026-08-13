import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/context/AppContext';

interface DonutChartProps {
  periodLabel: string;
  grossSales: number;
  data: { operating: number; bills: number; chemical: number };
  net: number;
}

const SIZE = 220;
const STROKE = 28;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

const SEGMENT_META = [
  { key: 'operating', label: 'Operating Expenses', color: '#B08D57' },
  { key: 'bills', label: 'Utility Bills', color: '#4A7FC1' },
  { key: 'chemical', label: 'Chemical', color: '#3F7D58' },
] as const;

export default function DonutChart({ periodLabel, grossSales, data, net }: DonutChartProps) {
  const [animated, setAnimated] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 20);
    return () => clearTimeout(t);
  }, [periodLabel, data.operating, data.bills, data.chemical]);

  const total = data.operating + data.bills + data.chemical;
  const segments = SEGMENT_META.map(m => ({ ...m, value: data[m.key] })).filter(s => s.value > 0);

  let cumulative = 0;
  const arcs = segments.map((seg, i) => {
    const len = total > 0 ? (seg.value / total) * CIRCUMFERENCE : 0;
    const offset = cumulative;
    cumulative += len;
    return { ...seg, len, offset, index: i };
  });

  const hovered = arcs.find(a => a.key === hoverKey);

  return (
    <div className="flex items-start gap-10">
      <div ref={containerRef} style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="var(--border-color)"
              strokeWidth={STROKE}
            />
            {total === 0 ? null : arcs.map(seg => {
              const isHovered = hoverKey === seg.key;
              const width = isHovered ? STROKE + 5 : STROKE;
              return (
                <circle
                  key={seg.key}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={seg.color}
                  strokeLinecap="round"
                  strokeWidth={width}
                  strokeDasharray={animated ? `${seg.len} ${CIRCUMFERENCE - seg.len}` : `0 ${CIRCUMFERENCE}`}
                  strokeDashoffset={-seg.offset}
                  onMouseEnter={() => setHoverKey(seg.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  style={{
                    pointerEvents: 'stroke',
                    cursor: 'pointer',
                    transformOrigin: `${CENTER}px ${CENTER}px`,
                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                    filter: isHovered ? `drop-shadow(0 0 10px ${seg.color})` : 'none',
                    transition: `stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1) ${seg.index * 80}ms, stroke-width .2s, transform .2s, filter .2s`,
                  }}
                />
              );
            })}
          </g>
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          {hovered ? (
            <>
              <span
                className="font-inter font-semibold uppercase"
                style={{ fontSize: '10px', color: 'var(--secondary-text)', letterSpacing: '0.5px' }}
              >
                {hovered.label}
              </span>
              <span className="font-lora font-semibold mt-1" style={{ fontSize: '17px', color: 'var(--dark-heading)' }}>
                {formatCurrency(hovered.value)}
              </span>
              <span className="font-inter mt-0.5" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
                {total > 0 ? Math.round((hovered.value / total) * 100) : 0}%
              </span>
            </>
          ) : (
            <>
              <span
                className="font-inter font-semibold uppercase"
                style={{ fontSize: '10px', color: 'var(--secondary-text)', letterSpacing: '0.5px' }}
              >
                Expenses
              </span>
              <span className="font-lora font-semibold mt-1" style={{ fontSize: '17px', color: 'var(--dark-heading)' }}>
                {formatCurrency(total)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1">
        <p className="font-lora font-semibold" style={{ fontSize: '15px', color: 'var(--dark-heading)' }}>
          {periodLabel}
        </p>
        <p className="font-inter mt-1" style={{ fontSize: '12px', color: 'var(--secondary-text)' }}>
          Gross sales {formatCurrency(grossSales)}
        </p>

        {segments.length === 0 ? (
          <p className="font-inter mt-4" style={{ fontSize: '14px', color: 'var(--muted-text)' }}>
            No expenses recorded for this period.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {arcs.map(seg => (
              <div
                key={seg.key}
                onMouseEnter={() => setHoverKey(seg.key)}
                onMouseLeave={() => setHoverKey(null)}
                className="flex items-center justify-between"
                style={{ cursor: 'pointer' }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                  <span className="font-inter font-semibold" style={{ fontSize: '12.5px', color: 'var(--dark-heading)' }}>
                    {seg.label}
                  </span>
                </div>
                <span className="font-inter" style={{ fontSize: '11.5px', color: 'var(--secondary-text)' }}>
                  {formatCurrency(seg.value)} · {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border-table)' }}>
          <p
            className="font-inter font-semibold uppercase"
            style={{ fontSize: '10px', color: 'var(--secondary-text)', letterSpacing: '0.5px' }}
          >
            {net >= 0 ? 'Net Profit' : 'Net Loss'}
          </p>
          <p
            className="font-lora font-semibold mt-1"
            style={{ fontSize: '26px', color: net >= 0 ? 'var(--brand-gold)' : 'var(--error)' }}
          >
            {formatCurrency(net)}
          </p>
        </div>
      </div>
    </div>
  );
}
