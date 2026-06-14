// @vitest-environment jsdom
import { waitFor } from "@testing-library/dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setGooglePhotorealisticTilesEnabled } from "../../src/sceneSetup.js";
import { initializePhotorealisticToggle } from "../../src/photorealisticToggle.js";

vi.mock("../../src/sceneSetup.js", () => ({
  setGooglePhotorealisticTilesEnabled: vi.fn(),
}));

// createToggleDom mirrors the production markup so the unit tests verify the
// same accessible checkbox contract used by presenters in the app shell.
function createToggleDom() {
  document.body.innerHTML = `
    <label id="photorealisticToggle" for="photorealisticToggleInput">
      <input id="photorealisticToggleInput" type="checkbox" />
      <span>Google 3D</span>
    </label>
  `;
}

// readToggle exposes the paired label/input elements used by the module under
// test without leaking query details into each assertion.
function readToggle() {
  return {
    root: document.getElementById("photorealisticToggle"),
    input: document.getElementById("photorealisticToggleInput"),
  };
}

describe("initializePhotorealisticToggle", () => {
  beforeEach(() => {
    createToggleDom();
    setGooglePhotorealisticTilesEnabled.mockReset();
  });

  test("reflects the initial lightweight scene state", () => {
    initializePhotorealisticToggle(
      {},
      {
        photorealisticEnabled: false,
        reason: "low-usage-default",
      },
    );

    const { root, input } = readToggle();
    expect(input.checked).toBe(false);
    expect(root.dataset.photorealistic).toBe("false");
    expect(root.dataset.sceneReason).toBe("low-usage-default");
  });

  test("reflects the initial photorealistic scene state", () => {
    initializePhotorealisticToggle(
      {},
      {
        photorealisticEnabled: true,
        reason: "configured",
      },
    );

    const { root, input } = readToggle();
    expect(input.checked).toBe(true);
    expect(root.dataset.photorealistic).toBe("true");
    expect(root.dataset.sceneReason).toBe("configured");
  });

  test("enables tiles through the scene setup helper", async () => {
    const viewer = {};
    const onSceneStatusChange = vi.fn();
    const enabledStatus = {
      sceneMode: "photorealistic",
      requestedMode: "photorealistic",
      photorealisticEnabled: true,
      source: "ui:photorealistic-toggle",
      reason: "user-enabled",
    };
    setGooglePhotorealisticTilesEnabled.mockResolvedValue(enabledStatus);
    initializePhotorealisticToggle(
      viewer,
      { photorealisticEnabled: false, reason: "low-usage-default" },
      onSceneStatusChange,
    );

    const { root, input } = readToggle();
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(root.classList.contains("is-loading")).toBe(true);
    expect(input.disabled).toBe(true);
    await waitFor(() =>
      expect(setGooglePhotorealisticTilesEnabled).toHaveBeenCalledWith(
        viewer,
        true,
      ),
    );

    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.checked).toBe(true);
    expect(root.dataset.photorealistic).toBe("true");
    expect(onSceneStatusChange).toHaveBeenCalledWith(enabledStatus);
  });

  test("rolls back the checkbox when tiles cannot be enabled", async () => {
    const fallbackStatus = {
      sceneMode: "lightweight",
      requestedMode: "photorealistic",
      photorealisticEnabled: false,
      source: "ui:photorealistic-toggle",
      reason: "missing-token",
    };
    setGooglePhotorealisticTilesEnabled.mockResolvedValue(fallbackStatus);
    initializePhotorealisticToggle(
      {},
      {
        photorealisticEnabled: false,
        reason: "low-usage-default",
      },
    );

    const { root, input } = readToggle();
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.checked).toBe(false);
    expect(root.classList.contains("is-error")).toBe(true);
    expect(root.dataset.sceneReason).toBe("missing-token");
    expect(root.dataset.errorMessage).toContain("VITE_CESIUM_ION_TOKEN");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("explains Cesium ion access failures when the checkbox rolls back", async () => {
    const fallbackStatus = {
      sceneMode: "lightweight",
      requestedMode: "photorealistic",
      photorealisticEnabled: false,
      source: "ui:photorealistic-toggle",
      reason: "access-forbidden",
      errorStatusCode: 403,
    };
    setGooglePhotorealisticTilesEnabled.mockResolvedValue(fallbackStatus);
    initializePhotorealisticToggle(
      {},
      {
        photorealisticEnabled: false,
        reason: "low-usage-default",
      },
    );

    const { root, input } = readToggle();
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.checked).toBe(false);
    expect(root.classList.contains("is-error")).toBe(true);
    expect(root.dataset.sceneReason).toBe("access-forbidden");
    expect(root.title).toContain("Cesium ion denied access");
    expect(root.dataset.errorMessage).toContain("allowed URLs");
    expect(input.getAttribute("aria-label")).toContain(
      "Cesium ion denied access",
    );
  });
});
