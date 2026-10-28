import { useId } from "react";

type Point = [number, number];

type RoadSpec = {
  viewBox: [number, number];
  // Curva do eixo: do ponto mais perto do espectador até o horizonte.
  curve: [Point, Point, Point, Point];
  nearWidth: number;
};

type RoadShape = {
  body: string;
  edges: string;
  dashes: string;
  horizon: Point;
};

const SAMPLES = 240;

function bezier([p0, p1, p2, p3]: RoadSpec["curve"], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// Escala de perspectiva: 1 perto do espectador, zero no horizonte.
function depth(t: number) {
  return Math.pow(1 - t, 1.6);
}

function polygon(points: Point[]) {
  return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
}

type AxisSample = { point: Point; normal: Point; scale: number; length: number };

function buildRoad({ curve, nearWidth }: RoadSpec): RoadShape {
  const axis: AxisSample[] = [];
  const at = (index: number) => {
    const sample = axis[index];
    if (!sample) throw new RangeError(`Amostra ${index} fora do eixo da estrada`);
    return sample;
  };
  let length = 0;
  let previous: Point | null = null;

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const point = bezier(curve, t);
    const ahead = bezier(curve, Math.min(1, t + 0.001));
    const behind = bezier(curve, Math.max(0, t - 0.001));
    const dx = ahead[0] - behind[0];
    const dy = ahead[1] - behind[1];
    const size = Math.hypot(dx, dy) || 1;
    if (previous) length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
    axis.push({ point, normal: [-dy / size, dx / size], scale: depth(t), length });
  }

  const offset = (index: number, distance: number): Point => {
    const { point, normal } = at(index);
    return [point[0] + normal[0] * distance, point[1] + normal[1] * distance];
  };

  const strip = (from: number, to: number, inner: number, outer: number) => {
    const forward: Point[] = [];
    const back: Point[] = [];
    for (let i = from; i <= to; i++) {
      const half = (nearWidth / 2) * at(i).scale;
      forward.push(offset(i, half * outer));
      back.unshift(offset(i, half * inner));
    }
    return polygon([...forward, ...back]);
  };

  const last = SAMPLES;
  const body = strip(0, last, -1, 1);
  const edges = strip(0, last, 0.9, 1) + strip(0, last, -1, -0.9);

  // Traços e vãos encolhem com a distância, como numa estrada de verdade.
  const dashes: string[] = [];
  const dashLength = nearWidth * 0.2;
  let index = 0;
  while (index < last && at(index).scale > 0.035) {
    const scale = at(index).scale;
    const start = at(index).length;
    let end = index;
    while (end < last && at(end).length - start < dashLength * scale) end++;
    if (end > index) dashes.push(strip(index, end, -0.035, 0.035));
    let gap = end;
    while (gap < last && at(gap).length - start < dashLength * 1.7 * scale) gap++;
    index = gap;
  }

  return { body, edges, dashes: dashes.join(""), horizon: at(last).point };
}

const portrait = buildRoad({
  viewBox: [400, 800],
  curve: [
    [-140, 1000],
    [520, 660],
    [-80, 380],
    [200, 190],
  ],
  nearWidth: 300,
});

const landscape = buildRoad({
  viewBox: [1440, 900],
  curve: [
    [1260, 1220],
    [760, 660],
    [1260, 460],
    [470, 370],
  ],
  nearWidth: 520,
});

function Road({
  road,
  viewBox,
  className,
}: {
  road: RoadShape;
  viewBox: [number, number];
  className: string;
}) {
  const fade = `login-road-fade-${useId()}`;
  const [hx, hy] = road.horizon;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${viewBox[0]} ${viewBox[1]}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient
          id={fade}
          cx={hx}
          cy={hy}
          r={viewBox[1] * 0.75}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.55" stopColor="white" stopOpacity="0.7" />
          <stop offset="1" stopColor="white" stopOpacity="1" />
        </radialGradient>
        <mask id={`${fade}-mask`}>
          <rect width={viewBox[0]} height={viewBox[1]} fill={`url(#${fade})`} />
        </mask>
        <radialGradient id={`${fade}-glow`}>
          <stop offset="0" className="login-backdrop__glow-core" />
          <stop offset="0.4" className="login-backdrop__glow-mid" />
          <stop offset="1" className="login-backdrop__glow-out" />
        </radialGradient>
      </defs>
      <circle cx={hx} cy={hy} r={viewBox[1] * 0.42} fill={`url(#${fade}-glow)`} />
      <g mask={`url(#${fade}-mask)`}>
        <path d={road.body} className="login-backdrop__road" />
        <path d={road.edges} className="login-backdrop__edge" />
        <path d={road.dashes} className="login-backdrop__dash" />
      </g>
    </svg>
  );
}

export function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      <Road road={portrait} viewBox={[400, 800]} className="login-backdrop__portrait" />
      <Road
        road={landscape}
        viewBox={[1440, 900]}
        className="login-backdrop__landscape"
      />
    </div>
  );
}
