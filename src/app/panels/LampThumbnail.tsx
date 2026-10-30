import { useId } from 'react';
import type { Project } from '@core/model/project.ts';

/** Lightweight catalogue illustrations derived from each example's shape and mount. */
export function LampThumbnail({ project }: { project: Project }) {
  const id = useId().replace(/:/g, '');
  const shade = project.shades[0];
  const s = shade.style;
  const standing = project.mount.kind === 'standing';
  const wall = project.mount.kind === 'wallArm';
  const height = s.family === 'tiered' ? s.tiers * s.tierDrop : s.height;
  const scale = Math.min(136 / s.bottomDiameter, (standing ? 64 : 94) / height);
  const rb = (s.bottomDiameter * scale) / 2;
  const rt = (s.topDiameter * scale) / 2;
  const h = height * scale;
  const y = standing ? 36 : 85 - h / 2;
  const bottom = y + h;
  const cx = wall ? 133 : 120;
  const curve = s.family === 'revolved' ? s.curve : 0;
  const radius = (t: number) => rt + (rb - rt) * t + Math.sin(t * Math.PI) * curve * rb * 0.25;
  const silhouette = `M ${cx - rt} ${y} Q ${cx - radius(0.5)} ${y + h / 2} ${cx - rb} ${bottom} Q ${cx} ${bottom + rb * 0.36} ${cx + rb} ${bottom} Q ${cx + radius(0.5)} ${y + h / 2} ${cx + rt} ${y} Q ${cx} ${y - rt * 0.3} ${cx - rt} ${y} Z`;
  const ribs =
    s.family === 'revolved' && s.surface.style !== 'smooth'
      ? Math.min(30, s.surface.patternCount)
      : s.family === 'slatted'
        ? Math.min(24, s.slatCount)
        : s.family === 'geometric'
          ? 14
          : 0;
  const twist = s.family === 'revolved' ? s.surface.twist : s.family === 'slatted' ? s.twist : 0;
  return (
    <svg viewBox="0 0 240 170" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-body`}>
          <stop offset="0" stopColor="#30382e" stopOpacity=".27" />
          <stop offset=".4" stopColor="#fffdf7" stopOpacity=".15" />
          <stop offset=".7" stopColor="#fffdf7" stopOpacity=".1" />
          <stop offset="1" stopColor="#30382e" stopOpacity=".25" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`}>
          <stop stopColor="#30382e" stopOpacity=".16" />
          <stop offset="1" stopColor="#30382e" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <path d={silhouette} />
        </clipPath>
      </defs>
      <ellipse cx={cx} cy="155" rx={standing ? 35 : rb * 0.8} ry="7" fill={`url(#${id}-shadow)`} />
      {standing ? (
        <g fill="none" stroke="var(--muted)">
          <path d={`M${cx} ${bottom}V147`} strokeWidth="4" />
          <ellipse cx={cx} cy="148" rx="32" ry="5" fill="var(--border)" />
        </g>
      ) : wall ? (
        <path
          d={`M70 48v50m0-36h${cx - 70}v${y - 62}`}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="3"
        />
      ) : (
        <path d={`M${cx} 0V${y}`} stroke="var(--muted)" strokeWidth="1.5" />
      )}
      {s.family === 'tiered' ? (
        <g>
          {Array.from({ length: s.tiers }, (_, i) => {
            const r = rt + ((rb - rt) * (i + 1)) / s.tiers;
            const top = y + (i * h) / s.tiers;
            return (
              <g key={i}>
                <path
                  d={`M${cx - r * 0.4} ${top} Q${cx - r * 0.6} ${top + (h / s.tiers) * 0.2} ${cx - r} ${top + (h / s.tiers) * 0.65} Q${cx} ${top + h / s.tiers} ${cx + r} ${top + (h / s.tiers) * 0.65} Q${cx + r * 0.6} ${top + (h / s.tiers) * 0.2} ${cx + r * 0.4} ${top}Z`}
                  fill={shade.colour}
                  stroke="var(--muted)"
                  strokeOpacity=".25"
                />
                <path
                  d={`M${cx - r * 0.4} ${top} Q${cx - r * 0.6} ${top + (h / s.tiers) * 0.2} ${cx - r} ${top + (h / s.tiers) * 0.65} Q${cx} ${top + h / s.tiers} ${cx + r} ${top + (h / s.tiers) * 0.65} Q${cx + r * 0.6} ${top + (h / s.tiers) * 0.2} ${cx + r * 0.4} ${top}Z`}
                  fill={`url(#${id}-body)`}
                />
              </g>
            );
          })}
        </g>
      ) : (
        <>
          <path d={silhouette} fill={shade.colour} />
          <path d={silhouette} fill={`url(#${id}-body)`} />
          <g
            clipPath={`url(#${id}-clip)`}
            fill="none"
            stroke="#30382e"
            strokeOpacity={s.family === 'slatted' ? '.45' : '.17'}
            strokeWidth={s.family === 'slatted' ? 4 : 0.8}
          >
            {Array.from({ length: ribs }, (_, i) => {
              const t = ((i + 0.5) / ribs) * 2 - 1;
              const bend = Math.sin((twist * Math.PI) / 180) * rb * 0.35;
              return (
                <path
                  key={i}
                  d={`M${cx + t * rt} ${y} Q${cx + t * radius(0.5) - bend} ${y + h * 0.55} ${cx + t * rb} ${bottom + 10}`}
                />
              );
            })}
            {s.family === 'geometric' &&
              s.variant === 'pleated' &&
              Array.from({ length: 4 }, (_, i) => (
                <path
                  key={i}
                  d={`M${cx - rb} ${y + (h * (i + 0.5)) / 4}l${rb / 2} 10 ${rb / 2} -10 ${rb / 2} 10 ${rb / 2} -10`}
                />
              ))}
            {s.family === 'geometric' &&
              s.variant === 'lattice' &&
              Array.from({ length: 42 }, (_, i) => (
                <circle
                  key={i}
                  cx={cx - rt + ((i % 7) * rt) / 3}
                  cy={y + 12 + (Math.floor(i / 7) * h) / 6}
                  r="3"
                  fill="var(--panel-2)"
                  strokeWidth="1"
                />
              ))}
          </g>
          <ellipse
            cx={cx}
            cy={bottom}
            rx={rb}
            ry={rb * 0.17}
            fill={project.shades[1]?.colour ?? shade.colour}
            stroke="var(--muted)"
            strokeOpacity=".3"
          />
        </>
      )}
    </svg>
  );
}
