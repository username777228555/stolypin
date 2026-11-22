import gzhelRaw from './gzhel-pattern.svg?raw';
import khokhlomaRaw from './khokhloma-pattern.svg?raw';

/**
 * Encode SVG patterns as inline data URIs so they never depend on relative CSS URL
 * resolution inside Vite's extracted `dist/assets/*.css` bundle or Android WebView.
 */
function toCssSvgUrl(svg: string): string {
  const compact = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(compact)}")`;
}

export const GZHEL_BG = toCssSvgUrl(gzhelRaw);
export const KHOKHLOMA_BG = toCssSvgUrl(khokhlomaRaw);
