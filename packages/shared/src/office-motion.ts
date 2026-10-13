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
  [4.45, 3.1, -1.3],
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
  return pathAt(
    index < 8
      ? [home, [5.7, 0, 3.7], [5.7, 3.1, 0.22], [4.4, 3.1, 0.55], seat]
      : [home, seat],
    progress,
  );
}
const visitors = [0, 1, 2, 3, 4, 5, 6, 7, 11, 12];
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
      activity: index === 10 ? "phone" : "work",
      position: home,
      moving: false,
    };
  const cycle = Math.floor(time / 90),
    phase = ((time % 90) + 90) % 90,
    offset =
      (visitors.indexOf(index) - (cycle % visitors.length) + visitors.length) %
      visitors.length;
  if (offset > 3) return { activity: "work", position: home, moving: false };
  const activity = offset === 3 ? "musolla" : "coffee",
    destination: Point =
      offset === 3 ? [4.4, 0, 1.4] : [2.4 + offset * 0.5, 0, -1.65];
  const p =
    phase < 15
      ? phase / 15
      : phase < 65
        ? 1
        : phase < 80
          ? 1 - (phase - 65) / 15
          : 0;
  return {
    activity: p === 0 ? "work" : activity,
    position: pathAt(
      activity === "musolla"
        ? [home, [3.3, 0, 2.7], [4.4, 0, 2.7], [4.4, 0, 2.05], destination]
        : [home, [3.3, 0, 2.1], [3.3, 0, -0.8], destination],
      p,
    ),
    moving: p > 0 && p < 1,
  };
}
