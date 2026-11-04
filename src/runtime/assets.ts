// Image loading. Everything is fetched once and cached; `image()` returns
// null until it has loaded (callers draw a placeholder meanwhile), and the
// boot screen awaits `preload()` for what must be ready on the first frame.

const images = new Map<string, HTMLImageElement | null>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  const known = pending.get(url);
  if (known) return known;
  if (typeof Image === 'undefined') {
    images.set(url, null);
    const p = Promise.resolve(null);
    pending.set(url, p);
    return p;
  }
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      images.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      images.set(url, null);
      resolve(null);
    };
    img.src = url;
  });
  pending.set(url, p);
  return p;
}

export function image(url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  const img = images.get(url);
  if (img === undefined) void loadImage(url);
  return img ?? null;
}

export async function preload(urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map((u) => loadImage(u)));
}

/** Every PNG under assets/ (hashed URLs), keyed by repository path ("/assets/sprites/..."). */
export const ASSET_URLS = import.meta.glob(['/assets/**/*.png', '/levels/common/tiles/*.png'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** URL of an asset by repository path ("assets/sprites/common/emerald/emerald.png"), or null. */
export function assetUrl(path: string): string | null {
  const key = path.startsWith('/') ? path : `/${path}`;
  return ASSET_URLS[key] ?? null;
}

/** The image for an asset path, or null until loaded / when missing. */
export function assetImage(path: string): HTMLImageElement | null {
  return image(assetUrl(path));
}

export function assetExists(path: string): boolean {
  return assetUrl(path) !== null;
}
