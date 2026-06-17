import { expect, test } from "@playwright/test";

// The smoke test checks the click-through presentation contract and lets Cesium
// handle rendering without asserting fragile WebGL pixels. Playwright starts
// the dev server in explicit lightweight mode so automated smoke tests do not
// consume Google Photorealistic 3D Tiles quota.
test("tour loads and advances", async ({ page }) => {
  test.setTimeout(45_000);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__shipyardCopiedCameraText = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__shipyardCopiedCameraText = text;
        },
      },
    });
  });

  await page.goto("/");

  await expect(page.locator("#cesiumContainer")).toBeVisible();
  await expect(page.locator("#tourPanel")).toBeVisible();
  await expect(page.locator("#sceneStatus")).toHaveCount(0);
  await expect(page.locator(".compass")).toBeVisible();
  await expect(page.locator(".navigation-controls")).toBeVisible();
  await expect(page.locator(".distance-legend")).toBeVisible();
  await expect(page.getByLabel("Google 3D")).toBeVisible();
  await expect(page.getByLabel("Google 3D")).not.toBeChecked();
  const tourPanelBox = await page.locator("#tourPanel").boundingBox();
  const compassBox = await page.locator(".compass").boundingBox();
  const toggleBox = await page.locator("#photorealisticToggle").boundingBox();
  const copyButtonBox = await page.locator("#cameraViewCopyButton").boundingBox();
  expect((tourPanelBox?.x ?? 0) + (tourPanelBox?.width ?? 0)).toBeLessThan(
    compassBox?.x ?? 0,
  );
  expect(toggleBox?.y ?? 999).toBeLessThan(compassBox?.y ?? 0);
  expect(copyButtonBox?.y ?? 0).toBeGreaterThan(toggleBox?.y ?? 0);
  expect(copyButtonBox?.y ?? 999).toBeLessThan(compassBox?.y ?? 0);
  await expect(
    page.getByRole("button", { name: "Copy current camera view" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy current camera view" }).click();
  await expect(
    page.getByRole("button", { name: "Copy current camera view" }),
  ).toHaveText("Copied");
  const copiedCameraPayload = await page.evaluate(() =>
    JSON.parse(window.__shipyardCopiedCameraText),
  );
  expect(copiedCameraPayload.type).toBe("ship_philly_tour_camera_view");
  expect(copiedCameraPayload.camera.destination).toBeTruthy();
  expect(copiedCameraPayload.camera.orientation).toBeTruthy();
  expect(copiedCameraPayload.absolutePoseSnippet.cameraMode).toBe(
    "absolutePose",
  );
  await expect(page.getByRole("button", { name: /next/i })).toBeVisible();

  await expect(page.locator("#slideTitle")).toHaveText("Shipyard Layout");

  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.locator("#slideTitle")).toHaveText("Shipyard Overview");
  const overviewTitle = await page.locator("#slideTitle").textContent();

  await page.getByRole("button", { name: /back/i }).click();
  await expect(page.locator("#slideTitle")).toHaveText("Shipyard Layout");

  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.locator("#slideTitle")).toHaveText("Shipyard Overview");

  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.locator("#slideTitle")).not.toHaveText(overviewTitle ?? "");

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#slideTitle")).toHaveText(overviewTitle ?? "");

  await expect(page.locator(".progress-dot")).toHaveCount(14);

  await page.locator(".progress-dot").nth(4).click();
  await expect(page.locator("#slideTitle")).toHaveText(
    "Panel Production Shops",
  );
  await expect(page.locator(".photo-item")).toHaveCount(4);
  const largePanelThumbnail = page.getByRole("button", {
    name: "Expand image: Large Panel Shop",
  });
  const thumbnailBox = await largePanelThumbnail.boundingBox();

  await largePanelThumbnail.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".photo-lightbox-image")).toBeVisible();
  await expect(page.locator(".photo-lightbox-title")).toHaveText(
    "Panel Production Shops",
  );
  await expect(page.locator(".photo-lightbox-caption")).toHaveText(
    "Large Panel Shop",
  );
  await expect(
    page.getByRole("button", { name: "Close expanded image" }),
  ).toBeVisible();
  const lightboxImageBox = await page
    .locator(".photo-lightbox-image")
    .boundingBox();
  const viewportSize = page.viewportSize();

  expect(lightboxImageBox?.width).toBeGreaterThan(
    (thumbnailBox?.width ?? 0) * 1.5,
  );
  expect(lightboxImageBox?.height).toBeLessThanOrEqual(
    (viewportSize?.height ?? 0) * 0.85 + 2,
  );
  expect(lightboxImageBox?.width).toBeLessThanOrEqual(
    (viewportSize?.width ?? 0) * 0.85 + 2,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.locator(".progress-dot").nth(12).click();
  await expect(page.locator("#slideTitle")).toHaveText("WIP Flight");

  await page.locator(".progress-dot").nth(13).click();
  await expect(page.locator("#slideTitle")).toHaveText("MES Network");
  expect(consoleErrors).toEqual([]);
});

// The 403 smoke test verifies the presenter-facing failure path without loading
// real Google tiles or consuming Photorealistic 3D Tiles quota.
test("Google 3D checkbox rolls back with a useful access-denied message", async ({
  page,
}) => {
  await page.route("**/v1/assets/2275207/endpoint**", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "Forbidden", message: "" }),
    });
  });

  await page.goto("/");

  const toggle = page.locator("#photorealisticToggle");
  const input = page.locator("#photorealisticToggleInput");
  await expect(input).not.toBeChecked();

  await input.click();

  await expect(toggle).toHaveAttribute("data-scene-reason", "access-forbidden");
  await expect(input).not.toBeChecked();
  await expect(toggle).toHaveAttribute(
    "title",
    /Cesium ion denied access to Photorealistic 3D Tiles/,
  );
});
