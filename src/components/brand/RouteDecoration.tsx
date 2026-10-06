import { useId } from "react";

// Um único eixo por rota mantém corpo, duas bordas e tracejado coincidentes.
function Road({
  path,
  className,
  dashOffset = 0,
}: {
  path: string;
  className: string;
  dashOffset?: number;
}) {
  const edgeMask = `route-edge-${useId()}`;
  return (
    <svg
      className={className}
      viewBox="0 0 640 520"
      aria-hidden="true"
      fill="none"
      focusable="false"
    >
      <defs>
        <mask
          id={edgeMask}
          x="-100"
          y="-100"
          width="900"
          height="800"
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          style={{ maskType: "luminance" }}
        >
          <path
            d={path}
            stroke="white"
            className="route-decoration__band"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            stroke="black"
            className="route-decoration__interior"
            vectorEffect="non-scaling-stroke"
          />
        </mask>
      </defs>
      <path
        d={path}
        className="route-decoration__body route-decoration__interior"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        className="route-decoration__edge route-decoration__band"
        mask={`url(#${edgeMask})`}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={path}
        className="route-decoration__center"
        strokeDasharray="16 13"
        strokeDashoffset={dashOffset}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function RouteDecoration() {
  return (
    <div className="route-decoration" aria-hidden="true">
      <Road
        className="route-decoration__top"
        path="M690-35C590-15 555 10 535 85C515 160 360 145 305 225C250 305 350 355 265 420C180 485 90 510-80 540"
      />
      <Road
        className="route-decoration__bottom"
        path="M-70 540C80 525 100 420 185 405C270 390 220 260 340 250C460 240 420 90 700 55"
        dashOffset={8}
      />
    </div>
  );
}
