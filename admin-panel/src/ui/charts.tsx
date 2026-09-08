import { useState, type ReactNode } from 'react';

/**
 * Los dos gráficos del panel, dibujados a mano con SVG.
 *
 * No se suma una librería de charts: son dos formas simples y el proyecto ya tomó esta decisión
 * antes (ver `src/components/booking/ProgressRing.tsx` en la app mobile). Si en algún momento
 * hacen falta gráficos de verdad (zoom, brush, varias series apiladas), ahí sí conviene recharts.
 */

/* ---------------------------------------------------------------- LineChart */

export type Series = {
  label: string;
  color: string;
  points: number[];
};

export function LineChart({
  labels,
  series,
  height = 220,
  valueSuffix = '',
}: {
  labels: string[];
  series: Series[];
  height?: number;
  valueSuffix?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const visible = series.filter((s) => !hidden.has(s.label));

  // Sistema de coordenadas fijo; el SVG escala solo con `width: 100%`.
  const W = 720;
  const H = height;
  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const rawMax = Math.max(1, ...visible.flatMap((s) => s.points));
  // Redondea el techo hacia arriba para que las líneas de grilla queden en números redondos.
  const step = Math.max(1, Math.ceil(rawMax / 4));
  const max = step * 4;

  const x = (i: number) => padL + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const toPath = (points: number[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');

  const toggle = (label: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      // No se permite apagar la última serie visible: un gráfico vacío no dice nada.
      else if (current.size < series.length - 1) next.add(label);
      return next;
    });
  };

  // Con muchos puntos, etiquetar todos amontona el eje: se muestran ~8 repartidas.
  const labelEvery = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <div>
      <div className="gg-row" style={{ marginBottom: 'var(--gg-s2)', gap: 'var(--gg-s4)' }}>
        {series.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => toggle(s.label)}
            className="gg-btn gg-btn--ghost gg-btn--sm"
            style={{ opacity: hidden.has(s.label) ? 0.4 : 1 }}
            aria-pressed={!hidden.has(s.label)}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: s.color,
                display: 'inline-block',
              }}
            />
            {s.label}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Gráfico de ${series.map((s) => s.label).join(' y ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grilla horizontal y escala */}
        {[0, 1, 2, 3, 4].map((n) => {
          const value = (max / 4) * n;
          return (
            <g key={n}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--gg-border)"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={y(value) + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--gg-text-faint)"
              >
                {value}
              </text>
            </g>
          );
        })}

        {/* Etiquetas del eje temporal */}
        {labels.map((label, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`${label}-${i}`}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--gg-text-faint)"
            >
              {label}
            </text>
          ) : null
        )}

        {/* Línea guía del punto bajo el mouse */}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--gg-border-strong)"
            strokeDasharray="3 3"
          />
        ) : null}

        {visible.map((s) => (
          <path
            key={s.label}
            d={toPath(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {hover !== null
          ? visible.map((s) => (
              <circle
                key={s.label}
                cx={x(hover)}
                cy={y(s.points[hover] ?? 0)}
                r={3.5}
                fill={s.color}
                stroke="#fff"
                strokeWidth={1.5}
              />
            ))
          : null}

        {/* Bandas invisibles que capturan el hover de cada punto */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={x(i) - innerW / labels.length / 2}
            y={padT}
            width={innerW / labels.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover !== null ? (
        <div
          className="gg-row"
          style={{ gap: 'var(--gg-s4)', fontSize: 'var(--gg-fs-sm)', marginTop: 'var(--gg-s1)' }}
        >
          <strong>{labels[hover]}</strong>
          {visible.map((s) => (
            <span key={s.label} style={{ color: s.color }}>
              {s.label}: <strong>{s.points[hover] ?? 0}</strong>
              {valueSuffix}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ height: 20 }} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- DonutGauge */

export function DonutGauge({
  ratio,
  size = 168,
  strokeWidth = 18,
  children,
}: {
  ratio: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${Math.round(clamped * 100)}% ocupado`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--gg-neutral-soft)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--gg-accent-ink)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          // Arranca arriba: por defecto SVG empieza a las 3 en punto y se lee como un reloj torcido.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
