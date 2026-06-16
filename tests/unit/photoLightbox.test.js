// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { PhotoLightbox } from "../../src/photoLightbox.js";

describe("PhotoLightbox", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="thumb" type="button">Thumb</button>`;
  });

  test("opens with the provided slide title, image, and caption", () => {
    const trigger = document.getElementById("thumb");
    const lightbox = new PhotoLightbox();

    trigger.focus();
    lightbox.open({
      title: "Panel Production Shops",
      src: "/photos/philly-large-panel.jpg",
      alt: "Large Panel Shop",
      caption: "Large Panel Shop",
    });

    expect(lightbox.isOpen).toBe(true);
    expect(document.querySelector(".photo-lightbox").classList.contains("is-open")).toBe(
      true,
    );
    expect(document.querySelector(".photo-lightbox-title").textContent).toBe(
      "Panel Production Shops",
    );
    expect(document.querySelector(".photo-lightbox-image").getAttribute("src")).toBe(
      "/photos/philly-large-panel.jpg",
    );
    expect(document.querySelector(".photo-lightbox-image").alt).toBe(
      "Large Panel Shop",
    );
    expect(document.querySelector(".photo-lightbox-caption").textContent).toBe(
      "Large Panel Shop",
    );
  });

  test("closes from Escape and restores focus", () => {
    const trigger = document.getElementById("thumb");
    const lightbox = new PhotoLightbox();

    trigger.focus();
    lightbox.open({
      title: "Panel Production Shops",
      src: "/photos/philly-large-panel.jpg",
      caption: "Large Panel Shop",
    });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(lightbox.isOpen).toBe(false);
    expect(document.querySelector(".photo-lightbox").classList.contains("is-open")).toBe(
      false,
    );
    expect(document.activeElement).toBe(trigger);
  });

  test("closes from the close button", () => {
    const lightbox = new PhotoLightbox();

    lightbox.open({
      title: "Panel Production Shops",
      src: "/photos/philly-large-panel.jpg",
      caption: "Large Panel Shop",
    });
    document.querySelector(".photo-lightbox-close").click();

    expect(lightbox.isOpen).toBe(false);
    expect(document.querySelector(".photo-lightbox-image").hasAttribute("src")).toBe(
      false,
    );
  });
});
