import { expect, test } from "@playwright/test";

// The smoke test checks the click-through presentation contract and lets Cesium
// handle rendering without asserting fragile WebGL pixels.
test("tour loads and advances", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");

  await expect(page.locator("#cesiumContainer")).toBeVisible();
  await expect(page.locator("#tourPanel")).toBeVisible();
  await expect(page.locator("#sceneStatus")).toHaveCount(0);
  await expect(page.locator(".compass")).toBeVisible();
  await expect(page.locator(".navigation-controls")).toBeVisible();
  await expect(page.locator(".distance-legend")).toBeVisible();
  const tourPanelBox = await page.locator("#tourPanel").boundingBox();
  const compassBox = await page.locator(".compass").boundingBox();
  expect((tourPanelBox?.x ?? 0) + (tourPanelBox?.width ?? 0)).toBeLessThan(compassBox?.x ?? 0);
  await expect(page.getByRole("button", { name: /next/i })).toBeVisible();

  const firstTitle = await page.locator("#slideTitle").textContent();

  await page.getByRole("button", { name: /next/i }).click();
  await expect(page.locator("#slideTitle")).not.toHaveText(firstTitle ?? "");

  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#slideTitle")).toHaveText(firstTitle ?? "");

  await expect(page.locator(".progress-dot")).toHaveCount(11);

  await page.locator(".progress-dot").nth(3).click();
  await expect(page.locator("#slideTitle")).toHaveText("Panel Production Shops");
  await expect(page.locator(".photo-item")).toHaveCount(5);
  expect(consoleErrors).toEqual([]);
});
