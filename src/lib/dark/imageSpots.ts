/**
 * BETA BUILDS ONLY (photo training): where each image was drawn on a page canvas in dark mode,
 * so a right-click on it can say "It's a photo" or "Not a photo". Turned on only in betas.
 */
export interface ImageSpot {
  /** In the canvas's pixels. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  source: WeakRef<object>;
}

const MAX_SPOTS = 400;
const spots = new WeakMap<object, ImageSpot[]>();
let tracking = false;

export function setSpotTracking(on: boolean): void {
  tracking = on;
}

/** Called by the engine's drawImage with the arguments after the image. */
export function recordSpot(ctx: CanvasRenderingContext2D, source: object, args: number[]): void {
  if (!tracking) return;
  const [dx, dy, dw, dh] = args.length >= 8 ? args.slice(4, 8) : args.length >= 4 ? args : [args[0] ?? 0, args[1] ?? 0, 1, 1];
  const t = ctx.getTransform();
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of [[dx!, dy!], [dx! + dw!, dy!], [dx!, dy! + dh!], [dx! + dw!, dy! + dh!]] as const) {
    xs.push(t.a * x + t.c * y + t.e);
    ys.push(t.b * x + t.d * y + t.f);
  }
  const spot = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), source: new WeakRef(source) };
  if (spot.x1 - spot.x0 < 8 || spot.y1 - spot.y0 < 8) return;
  let list = spots.get(ctx.canvas);
  if (!list) spots.set(ctx.canvas, (list = []));
  const same = list.findIndex((s) => s.source.deref() === source && Math.abs(s.x0 - spot.x0) < 1 && Math.abs(s.y0 - spot.y0) < 1);
  if (same >= 0) list.splice(same, 1);
  list.push(spot);
  if (list.length > MAX_SPOTS) list.shift();
}

/** The image drawn last (on top) at this point of the canvas. */
export function spotAt(canvas: HTMLCanvasElement, x: number, y: number): ImageSpot | null {
  const list = spots.get(canvas);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1 && s.source.deref()) return s;
  }
  return null;
}
