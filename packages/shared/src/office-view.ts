import type { Point } from "./office-motion";
export type OfficeFloor = "all" | "1" | "2";
const direction: Point = [0.54, 0.5, 0.677052435];
export function fitOfficeView(floor: OfficeFloor, aspect: number, fov = 39) {
  if (
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    !Number.isFinite(fov) ||
    fov <= 10 ||
    fov >= 100
  )
    throw new Error("Invalid camera viewport");
  const min: Point = [-6.4, floor === "2" ? 1.55 : -1.65, -4.4];
  const max: Point = [
    6.4,
    floor === "1" ? 2.05 : 5.05,
    floor === "2" ? 1.2 : 4.4,
  ];
  const target = min.map((n, i) => (n + max[i]) / 2) as Point;
  const d = direction.map((n) => n / Math.hypot(...direction)) as Point;
  const rightLength = Math.hypot(d[0], d[2]),
    right: Point = [d[2] / rightLength, 0, -d[0] / rightLength];
  const up: Point = [
    d[1] * right[2],
    d[2] * right[0] - d[0] * right[2],
    -d[1] * right[0],
  ];
  const vertical = Math.tan((fov * Math.PI) / 360) * 0.84,
    horizontal = vertical * aspect;
  const dot = (a: Point, b: Point) =>
    a.reduce((sum, n, i) => sum + n * b[i], 0);
  let distance = 8;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const offset: Point = [x - target[0], y - target[1], z - target[2]];
        distance = Math.max(
          distance,
          dot(offset, d) + Math.abs(dot(offset, right)) / horizontal,
          dot(offset, d) + Math.abs(dot(offset, up)) / vertical,
        );
      }
  return {
    target,
    position: target.map((n, i) => n + d[i] * distance) as Point,
    distance,
    bounds: { min, max },
  };
}
