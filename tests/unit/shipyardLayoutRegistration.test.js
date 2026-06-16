import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildLayoutTransform,
  buildShipyardLayoutRegistrationData,
  findPlacemarkByNames,
  pixelToCoordinate,
} from "../../scripts/convertShipyardLayoutKml.mjs";

const WIP_KML = readFileSync(
  new URL("../../WIP_Tour.kml", import.meta.url),
  "utf8",
);

// readGeneratedRegistration loads the checked-in runtime artifact so tests
// cover both converter behavior and the file served by GitHub Pages.
function readGeneratedRegistration() {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../public/data/shipyard-layout-registration.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

describe("shipyard layout KML registration", () => {
  test("extracts both layout anchors and tolerates the current section typo", () => {
    const data = buildShipyardLayoutRegistrationData(WIP_KML);

    expect(
      findPlacemarkByNames(WIP_KML, [
        "Section_Assembly_NE_Corner",
        "Secetion_Assembly_NE_Corner",
      ])?.name,
    ).toBe("Secetion_Assembly_NE_Corner");
    expect(data.source.anchors.sectionAssemblyNE.canonicalName).toBe(
      "Section_Assembly_NE_Corner",
    );
    expect(data.source.anchors.sectionAssemblyNE.matchedName).toBe(
      "Secetion_Assembly_NE_Corner",
    );
    expect(data.source.anchors.buildingDockSW.matchedName).toBe(
      "Building_Dock_SW_Corner",
    );
  });

  test("solves a stable two-point scale, rotation, and overhead camera", () => {
    const data = buildShipyardLayoutRegistrationData(WIP_KML);

    expect(data.image).toEqual({
      src: "/photos/philly-shipyard-layout.png",
      widthPx: 3359,
      heightPx: 2106,
    });
    expect(data.transform.scaleMPerPixel).toBeCloseTo(0.371476715837);
    expect(data.transform.widthM).toBeCloseTo(1247.790288496735);
    expect(data.transform.heightM).toBeCloseTo(782.32996355288);
    expect(data.transform.diagonalM).toBeCloseTo(1472.759578457874);
    expect(data.center.lonDeg).toBeCloseTo(-75.190027568062);
    expect(data.center.latDeg).toBeCloseTo(39.890066622311);
    expect(data.camera.headingDeg).toBeCloseTo(83.536407262463);
    expect(data.camera.pitchDeg).toBe(-90);
  });

  test("round-trips both pixel anchors back to their KML coordinates", () => {
    const data = buildShipyardLayoutRegistrationData(WIP_KML);
    const sectionAnchor = data.source.anchors.sectionAssemblyNE;
    const buildingDockAnchor = data.source.anchors.buildingDockSW;
    const transform = buildLayoutTransform(sectionAnchor, buildingDockAnchor);
    const sectionCoordinate = pixelToCoordinate(
      { x: 1445, y: 659 },
      sectionAnchor,
      transform,
    );
    const buildingDockCoordinate = pixelToCoordinate(
      { x: 3181, y: 1373 },
      sectionAnchor,
      transform,
    );

    expect(sectionCoordinate.lonDeg).toBeCloseTo(
      sectionAnchor.coordinate.lonDeg,
      10,
    );
    expect(sectionCoordinate.latDeg).toBeCloseTo(
      sectionAnchor.coordinate.latDeg,
      10,
    );
    expect(buildingDockCoordinate.lonDeg).toBeCloseTo(
      buildingDockAnchor.coordinate.lonDeg,
      10,
    );
    expect(buildingDockCoordinate.latDeg).toBeCloseTo(
      buildingDockAnchor.coordinate.latDeg,
      10,
    );
  });

  test("writes the generated runtime registration with four corners", () => {
    const registration = readGeneratedRegistration();

    expect(registration.corners).toHaveLength(4);
    expect(registration.corners.map((corner) => corner.id)).toEqual([
      "topLeft",
      "topRight",
      "bottomRight",
      "bottomLeft",
    ]);
    expect(registration.source.anchors.buildingDockSW.pixel).toEqual({
      x: 3181,
      y: 1373,
    });
    expect(registration.camera.heightM).toBeCloseTo(1472.759578);
  });
});
