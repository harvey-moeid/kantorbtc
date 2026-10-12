import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fitOfficeView } from "./office-view";
describe("office framing", () => {
  it.each([0.55, 0.8, 1, 1.5, 2.4])(
    "fits floor corners through the real perspective camera at aspect %s",
    (aspect) => {
      for (const floor of ["all", "1", "2"] as const) {
        const view = fitOfficeView(floor, aspect);
        const camera = new THREE.PerspectiveCamera(39, aspect, 0.1, 200);
        camera.position.set(...view.position);
        camera.lookAt(...view.target);
        camera.updateMatrixWorld();
        for (const x of [view.bounds.min[0], view.bounds.max[0]])
          for (const y of [view.bounds.min[1], view.bounds.max[1]])
            for (const z of [view.bounds.min[2], view.bounds.max[2]]) {
              const projected = new THREE.Vector3(x, y, z).project(camera);
              expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.84001);
              expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.84001);
              expect(projected.z).toBeGreaterThan(-1);
              expect(projected.z).toBeLessThan(1);
            }
      }
    },
  );
  it("selects a higher target for the strategy floor", () =>
    expect(fitOfficeView("2", 1).target[1]).toBeGreaterThan(
      fitOfficeView("1", 1).target[1],
    ));
  it.each([0, -1, NaN, Infinity])("rejects invalid viewport %s", (aspect) =>
    expect(() => fitOfficeView("all", aspect)).toThrow(),
  );
});
