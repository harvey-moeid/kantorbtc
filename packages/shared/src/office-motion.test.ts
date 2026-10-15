import { describe, expect, it } from "vitest";
import {
  homes,
  seats,
  idleRoutine,
  meetingPosition,
  pathAt,
} from "./office-motion";
describe("office paths and capacity", () => {
  it("starts and ends at the exact waypoints", () => {
    expect(
      pathAt(
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 3, 0],
        ],
        0,
      ),
    ).toEqual([0, 0, 0]);
    expect(
      pathAt(
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 3, 0],
        ],
        1,
      ),
    ).toEqual([10, 3, 0]);
  });
  it("interpolates by distance rather than waypoint count", () =>
    expect(
      pathAt(
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 3, 0],
        ],
        0.5,
      ),
    ).toEqual([6.5, 0, 0]));
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    "brings core employee %s to their own seat",
    (index) => {
      expect(meetingPosition(index, 0)).toEqual(homes[index]);
      expect(meetingPosition(index, 1)).toEqual(seats[index]);
    },
  );
  it("all lower-floor participants ascend through the actual stair corridor", () => {
    for (let i = 0; i < 8; i++)
      for (let p = 0; p < 1; p += 0.005) {
        const [x, y, z] = meetingPosition(i, p);
        if (y > 0 && y < 3.1) {
          expect(x).toBeCloseTo(8);
          expect(z).toBeGreaterThanOrEqual(0.22);
          expect(z).toBeLessThanOrEqual(3.7);
        }
      }
  });
  it("routes meeting participants around the table and director suite", () => {
    for (let i = 0; i < 11; i++) {
      for (let p = 0; p <= 1; p += 0.002) {
        const [x, y, z] = meetingPosition(i, p);
        if (y === 3.1) {
          expect(x > -1.55 && x < 2.05 && z > -2.12 && z < -0.78).toBe(false);
          if (i < 8 && x > 3.25 && x < 7.5) expect(z).toBeGreaterThan(0.8);
        }
        if (y === 0 && i < 4 && z > 1.6 && z < 2.9)
          expect(x).toBeGreaterThanOrEqual(2.7);
      }
    }
  });
  it("does not put RR staff and director downstairs", () => {
    for (let i = 8; i < 11; i++)
      for (let p = 0; p <= 1; p += 0.1)
        expect(meetingPosition(i, p)[1]).toBe(3.1);
  });
  it("respects pantry and musolla capacities across every routine cycle", () => {
    for (let t = 0; t < 1000; t += 5) {
      const routines = homes.map((_, i) => idleRoutine(i, t));
      expect(
        routines.filter((r) => r.activity === "coffee").length,
      ).toBeLessThanOrEqual(3);
      expect(
        routines.filter((r) => r.activity === "musolla").length,
      ).toBeLessThanOrEqual(1);
    }
  });
  it("enters the prayer room through its front doorway", () => {
    for (let t = 0; t < 180; t += 0.1) {
      for (let i = 0; i < homes.length; i++) {
        const routine = idleRoutine(i, t);
        if (routine.activity !== "musolla") continue;
        const [x, , z] = routine.position;
        if (x > 3.55 && z < 2.3) {
          expect(x).toBeCloseTo(4.4);
          expect(z).toBeGreaterThanOrEqual(1.4);
        }
      }
    }
  });
  it("keeps upper-floor staff on their own floor while idle", () => {
    for (let t = 0; t < 1000; t += 30)
      for (let i = 8; i <= 10; i++)
        expect(idleRoutine(i, t).position[1]).toBe(3.1);
  });
  it("keeps idle walks out of workstation desk footprints", () => {
    for (let t = 0; t < 900; t += 0.2) {
      for (let i = 0; i < homes.length; i++) {
        const routine = idleRoutine(i, t);
        if (!routine.moving) continue;
        const [x, y, z] = routine.position;
        if (y !== 0) continue;
        for (const [deskX, , deskZ] of homes.slice(0, 8)) {
          expect(
            Math.abs(x - deskX) < 0.85 && Math.abs(z - (deskZ - 0.72)) < 0.48,
          ).toBe(false);
        }
      }
    }
  });
  it("moves continuously across activity and routine-cycle changes", () => {
    for (let i = 0; i < homes.length; i++) {
      let previous = idleRoutine(i, 0).position;
      for (let t = 0.1; t < 190; t += 0.1) {
        const next = idleRoutine(i, t).position;
        expect(
          Math.hypot(...next.map((n, axis) => n - previous[axis])),
        ).toBeLessThan(0.09);
        previous = next;
      }
    }
  });
});
