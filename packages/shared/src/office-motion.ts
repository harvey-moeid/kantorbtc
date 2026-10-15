export type Point = [number, number, number];
export const homes: Point[] = [
  [-4.2, 0, 0.9],
  [-2.35, 0, 0.9],
  [-0.5, 0, 0.9],
  [1.4, 0, 0.9],
  [-4.2, 0, 3],
  [-2.35, 0, 3],
  [-0.5, 0, 3],
  [1.4, 0, 3],
  [-4.1, 3.1, -1.7],
  [-4.1, 3.1, -0.1],
  [5.5, 3.1, -1.3],
  [3.8, 0, 3.1],
  [-4.5, 0, -1.65],
];
export const seats: Point[] = [
  [-0.95, 3.1, -2.4],
  [0, 3.1, -2.4],
  [0.95, 3.1, -2.4],
  [1.9, 3.1, -2.4],
  [-0.95, 3.1, -0.55],
  [0, 3.1, -0.55],
  [0.95, 3.1, -0.55],
  [1.9, 3.1, -0.55],
  [2.75, 3.1, -1],
  [2.75, 3.1, -1.8],
  [-1.85, 3.1, -1.5],
];
export function pathAt(points: Point[], progress: number): Point {
  if (!points.length) throw new Error("Path must have at least one waypoint.");
  if (!Number.isFinite(progress) || progress <= 0) return [...points[0]];
  if (progress >= 1) return [...points.at(-1)!];
  const lengths = points
      .slice(1)
      .map((p, i) => Math.hypot(...p.map((n, k) => n - points[i][k]))),
    total = lengths.reduce((a, b) => a + b, 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] && lengths[i] > 0) {
      const p = distance / lengths[i];
      return points[i].map((n, k) => n + (points[i + 1][k] - n) * p) as Point;
    }
    distance -= lengths[i];
  }
  return [...points.at(-1)!];
}
export function meetingPosition(index: number, progress: number): Point {
  const home = homes[index],
    seat = seats[index] || home;
  const approach: Point[] =
    seat[2] < -2
      ? [[3, 3.1, 1.65], [3, 3.1, -3.05], [seat[0], 3.1, -3.05], seat]
      : [[seat[0], 3.1, 1.65], seat];
  return pathAt(
    index < 8
      ? [
          home,
          [home[0], 0, index < 4 ? 1.4 : 3.7],
          [2.7, 0, index < 4 ? 1.4 : 3.7],
          [2.7, 0, 3.7],
          [8, 0, 3.7],
          [8, 3.1, 0.22],
          [8, 3.1, 1.65],
          ...approach,
        ]
      : [
          home,
          ...(index === 8
            ? [[-3.35, 3.1, home[2]] as Point, [-3.35, 3.1, 1.65] as Point]
            : [[home[0], 3.1, 1.65] as Point]),
          ...approach,
        ],
    progress,
  );
}
const visitors = [0, 1, 2, 3, 4, 5, 6, 7, 11, 12];
// Geometry is static: build routes once instead of rebuilding every animation frame.
const idlePaths = homes.map((home, index) =>
  Array.from({ length: 4 }, (_, offset) => {
    const activity = offset === 3 ? "musolla" : "coffee";
    const destination: Point =
      offset === 3 ? [4.4, 0, 1.4] : [2.4 + offset * 0.5, 0, -1.65];
    // Leave each desk through its own row aisle before joining the circulation lane.
    const exit: Point = [
      home[0],
      0,
      index === 12 ? -1.2 : index < 4 ? 1.4 : 3.7,
    ];
    const route: Point[] =
      activity === "musolla"
        ? [
            home,
            exit,
            [3.3, 0, exit[2]],
            [3.3, 0, 2.7],
            [4.4, 0, 2.7],
            [4.4, 0, 2.05],
            destination,
          ]
        : [
            home,
            exit,
            [2.65, 0, exit[2]],
            [2.65, 0, -0.8],
            [destination[0], 0, -0.8],
            destination,
          ];
    // Small corner arcs prevent abrupt right-angle turns. Each visitor starts separately.
    const rounded = roundCorners(
      route.map((p) => (p[0] === 2.65 ? [2.5, p[1], p[2]] : p)),
    );
    const returnRounded = roundCorners(
      route.map((p) => (p[0] === 2.65 ? [3.1, p[1], p[2]] : p)),
    );
    const returnLength = returnRounded
      .slice(1)
      .reduce(
        (sum, point, i) =>
          sum + Math.hypot(...point.map((n, k) => n - returnRounded[i][k])),
        0,
      );
    const length = rounded
      .slice(1)
      .reduce(
        (sum, point, i) =>
          sum + Math.hypot(...point.map((n, k) => n - rounded[i][k])),
        0,
      );
    return {
      rounded,
      returnRounded,
      travel: length / 0.8,
      returnTravel: returnLength / 0.8,
    };
  }),
);
export function idleRoutine(
  index: number,
  time: number,
): {
  activity: "work" | "coffee" | "musolla" | "phone";
  position: Point;
  moving: boolean;
} {
  const home = homes[index];
  if (index >= 8 && index <= 10)
    return {
      activity:
        index === 10 && time % 90 >= 62 && time % 90 < 76 ? "phone" : "work",
      position: home,
      moving: false,
    };
  const cycle = Math.floor(time / 90),
    phase = ((time % 90) + 90) % 90,
    offset =
      (visitors.indexOf(index) - (cycle % visitors.length) + visitors.length) %
      visitors.length;
  if (offset > 3) return { activity: "work", position: home, moving: false };
  const activity = offset === 3 ? "musolla" : "coffee";
  const { rounded, returnRounded, travel, returnTravel } =
    idlePaths[index][offset];
  const local = phase - offset * 1.4;
  const p =
    local <= 0
      ? 0
      : local < travel
        ? local / travel
        : local < 85 - returnTravel
          ? 1
          : local < 85
            ? (85 - local) / returnTravel
            : 0;
  return {
    activity: p === 0 ? "work" : activity,
    position: pathAt(local >= 85 - returnTravel ? returnRounded : rounded, p),
    moving: p > 0 && p < 1,
  };
}

export function roundCorners(points: Point[], radius = 0.2): Point[] {
  if (points.length < 3) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const before = Math.hypot(...b.map((n, k) => n - a[k]));
    const after = Math.hypot(...c.map((n, k) => n - b[k]));
    const cut = Math.min(radius, before / 3, after / 3);
    if (cut === 0) {
      result.push(b);
      continue;
    }
    const entry = b.map((n, k) => n + ((a[k] - n) * cut) / before) as Point;
    const exit = b.map((n, k) => n + ((c[k] - n) * cut) / after) as Point;
    result.push(entry);
    for (let j = 1; j <= 5; j++) {
      const t = j / 5;
      result.push(
        b.map(
          (n, k) =>
            (1 - t) ** 2 * entry[k] + 2 * (1 - t) * t * n + t * t * exit[k],
        ) as Point,
      );
    }
  }
  result.push(points.at(-1)!);
  return result;
}
