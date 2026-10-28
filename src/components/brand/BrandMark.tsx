import { useId } from "react";

/**
 * Símbolo do chegaJunto: aperto de mãos (uma clara, uma lilás) sobre a estrada
 * em perspectiva. Versão enxuta do ícone do app (design/brand/icon-512.svg),
 * sem filtros nem brilhos, para ficar nítida em tamanho pequeno.
 */
const LEFT_FINGERS = [
  { x: 155, y: 299, r: -14, cx: 172, cy: 338 },
  { x: 195, y: 311, r: -14, cx: 212, cy: 350 },
  { x: 235, y: 317, r: -10, cx: 252, cy: 356 },
  { x: 275, y: 317, r: -4, cx: 292, cy: 356 },
];
const RIGHT_FINGERS = [
  { x: 311, y: 315, w: 30, h: 70, r: -2, cx: 326, cy: 350 },
  { x: 343, y: 311, w: 30, h: 70, r: 4, cx: 358, cy: 346 },
  { x: 374, y: 308, w: 28, h: 64, r: 10, cx: 388, cy: 340 },
];

export function BrandMark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `bm-${name}-${uid}`;
  const ref = (name: string) => `url(#${id(name)})`;

  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241B34" />
          <stop offset=".55" stopColor="#14111C" />
          <stop offset="1" stopColor="#0B0A0F" />
        </linearGradient>
        <radialGradient id={id("glow")}>
          <stop offset="0" stopColor="#C7A2EB" stopOpacity=".8" />
          <stop offset=".45" stopColor="#C7A2EB" stopOpacity=".2" />
          <stop offset="1" stopColor="#C7A2EB" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("light")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".6" stopColor="#DCDCE6" />
          <stop offset="1" stopColor="#A9A9BC" />
        </linearGradient>
        <linearGradient id={id("lilac")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E6CFFA" />
          <stop offset=".5" stopColor="#B88EE1" />
          <stop offset="1" stopColor="#6E4FA8" />
        </linearGradient>
        <linearGradient id={id("cuff")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A3446" />
          <stop offset="1" stopColor="#1D1926" />
        </linearGradient>
        <linearGradient id={id("road")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C7A2EB" stopOpacity="0" />
          <stop offset="1" stopColor="#C7A2EB" stopOpacity=".55" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <rect width="512" height="512" rx="112" />
        </clipPath>
      </defs>
      <g clipPath={ref("clip")}>
        <rect width="512" height="512" fill={ref("bg")} />
        <polygon
          points="256,236 214,236 -40,512 150,512"
          fill={ref("road")}
          opacity=".55"
        />
        <polygon
          points="256,236 298,236 552,512 362,512"
          fill={ref("road")}
          opacity=".55"
        />
        <ellipse cx="256" cy="262" rx="190" ry="120" fill={ref("glow")} />
        <g transform="rotate(-8 256 280)" stroke="#131316" strokeWidth="5">
          <path
            d="M96 206 C150 190 232 188 292 206 L346 246 L342 330 C268 356 168 346 96 318Z"
            fill={ref("light")}
            strokeLinejoin="round"
          />
          <rect
            x="28"
            y="186"
            width="76"
            height="150"
            rx="14"
            fill={ref("cuff")}
            stroke="#C7A2EB"
            strokeOpacity=".7"
            strokeWidth="3"
          />
          <rect
            x="84"
            y="186"
            width="20"
            height="150"
            rx="6"
            fill="#C7A2EB"
            opacity=".85"
            stroke="none"
          />
          <path
            d="M416 206 C368 192 322 192 286 206 L226 240 C206 252 214 276 240 274 L318 266 L350 330 C386 332 404 324 416 318Z"
            fill={ref("lilac")}
            strokeLinejoin="round"
          />
          <path
            d="M320 214 C282 204 236 214 204 240 C192 252 200 270 222 268 C262 264 300 252 330 240Z"
            fill={ref("lilac")}
            strokeLinejoin="round"
          />
          <rect
            x="408"
            y="186"
            width="76"
            height="150"
            rx="14"
            fill={ref("cuff")}
            stroke="#C7A2EB"
            strokeOpacity=".7"
            strokeWidth="3"
          />
          <rect
            x="408"
            y="186"
            width="20"
            height="150"
            rx="6"
            fill="#C7A2EB"
            opacity=".85"
            stroke="none"
          />
          {LEFT_FINGERS.map((f) => (
            <rect
              key={f.x}
              x={f.x}
              y={f.y}
              width="34"
              height="78"
              rx="17"
              fill={ref("light")}
              transform={`rotate(${f.r} ${f.cx} ${f.cy})`}
            />
          ))}
          {RIGHT_FINGERS.map((f) => (
            <rect
              key={f.x}
              x={f.x}
              y={f.y}
              width={f.w}
              height={f.h}
              rx={f.w / 2}
              fill={ref("lilac")}
              transform={`rotate(${f.r} ${f.cx} ${f.cy})`}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
