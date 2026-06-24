// Neutral dark low-quality placeholder (8×8 #161616 PNG) used as the
// `blurDataURL` for prominent remote images (cover art, artist photos) so they
// blur up from the page's own dark tone instead of flashing white on slow
// connections. Generic on purpose — no per-image LQIP pipeline needed.
export const BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGMQwwEYhpYEAHMiEIFXXEo8AAAAAElFTkSuQmCC";
