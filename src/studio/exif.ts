/**
 * 照片 EXIF 光学遥测：字段元数据、JPEG 二进制解析、缺失参数的模糊乱码渲染。
 *
 * 2026-10-18 从 demo/studio_hud.html 的单文件原型中抽出并模块化。
 * 解析只在浏览器里对用户刚选的图片做，不上传、不落盘。
 */
import { chineseFullDate } from '../utils/date';
import { esc } from './ui';

export const EXIF_FIELD_META = [
  { key: 'date', code: 'DATE // 拍摄日期', label: '拍摄日期', placeholder: '如：二〇二四年十月七日 · 18:17' },
  { key: 'location', code: 'LOCATION // 拍摄地点', label: '拍摄地点', placeholder: '如：重庆 · 南滨路江畔' },
  { key: 'aspect', code: 'ASPECT // 原生画幅', label: '原生画幅', placeholder: '如：16:9 横幅 (2560×1440)' },
  { key: 'camera', code: 'CAMERA // 器材机身', label: '器材机身', placeholder: '留空则在用户侧渲染为模糊乱码' },
  { key: 'lens', code: 'LENS // 镜头焦段', label: '镜头焦段', placeholder: '留空则在用户侧渲染为模糊乱码' },
  { key: 'exposure', code: 'EXPOSURE // 曝光参数', label: '曝光参数', placeholder: '如：f/5.6 · 1/320s · ISO 160' },
  { key: 'color', code: 'COLOR // 色彩科学', label: '色彩科学', placeholder: '如：WARM AMBER // 暮色直出' },
  { key: 'gps', code: 'COORDINATES // 经纬', label: '经纬坐标', placeholder: "如：29°33'N · 106°34'E" },
  { key: 'ev', code: 'LUMINANCE // 曝光偏移', label: '影调偏移', placeholder: '如：EV -0.3 · HIGH DYNAMIC' },
] as const;

export type ExifFieldKey = (typeof EXIF_FIELD_META)[number]['key'];

export interface PhotoMetadata {
  file: string;
  caption: string;
  title?: string;
  story?: string;
  group?: string;
  coord?: string;
  date?: string;
  location?: string;
  aspect?: string;
  ar?: number;
  ratioPill?: string;
  camera?: string;
  lens?: string;
  exposure?: string;
  color?: string;
  gps?: string;
  ev?: string;
  hist?: number[];
  /** 哪些字段是从原图 EXIF 自动读出来的（用于后台显示“自动读取/手动覆写”） */
  autoFields?: ExifFieldKey[];
}

const CIPHER_GLYPHS = '░▒▓█▚▞⌬⟁⧖☍⌖⌗⌘∷≈≠±∞∆∇∑∏λμσφψω0123456789ABCDEF';

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function generateArtisticCipherText(fieldKey: string, seed = 'frame'): string {
  const h = hashSeed(`${seed}:${fieldKey}`);
  const pick = (len: number, offset = 0) => {
    let out = '';
    for (let i = 0; i < len; i++) {
      const idx = (h + (i + offset) * 37 + i * i * 13) % CIPHER_GLYPHS.length;
      out += CIPHER_GLYPHS[idx];
    }
    return out;
  };
  switch (fieldKey) {
    case 'camera':
      return `⌬ ${pick(4, 1)} // ░▒▓-${pick(3, 5)}`;
    case 'lens':
      return `ƒ/${pick(2, 2)}mm · ⟁${pick(4, 7)}░`;
    case 'exposure':
      return `f/░.${pick(1, 3)} · 1/${pick(3, 4)}s · ISO ▒${pick(2, 6)}`;
    case 'gps':
      return `${pick(2, 1)}°${pick(2, 2)}'N · ${pick(3, 4)}°${pick(2, 6)}'E`;
    case 'location':
      return `⌖ ${pick(3, 2)} · ░▒▓${pick(3, 8)}`;
    case 'color':
      return `⧖ ${pick(4, 3)} // SPEC-░▒`;
    case 'date':
      return `二〇▒▒年░░月▒▒日 · ${pick(2, 1)}:${pick(2, 3)}`;
    case 'aspect':
      return `16:9 // ░▒▓×▒░▓`;
    case 'ev':
      return `EV ±░.${pick(1, 5)} · CIPHER`;
    default:
      return `░▒▓ ${pick(6, 0)} ▓▒░`;
  }
}

export function renderExifValueOrCipherHtml(
  fieldKey: ExifFieldKey,
  value: unknown,
  seed = 'frame',
  cipherEnabled = true
): string {
  const clean = String(value ?? '').trim();
  if (clean) return `<strong>${esc(clean)}</strong>`;
  if (!cipherEnabled) {
    return `<strong class="exif-val-normal" style="color:var(--faint);">—</strong>`;
  }
  const cipher = generateArtisticCipherText(fieldKey, seed);
  const ghost = generateArtisticCipherText(fieldKey, `${seed}:ghost`);
  return `<strong class="exif-val-cipher" data-cipher-ghost="${esc(ghost)}" title="未读取到原始摄影信息且未手动填写 · 已启用模糊化乱码艺术处理"><span class="exif-cipher-blur" aria-hidden="true">${esc(cipher)}</span><span class="exif-cipher-mask">UNREAD // 乱码隐去</span></strong>`;
}

/* --------------------------------------------------------------------------
   JPEG EXIF 二进制解析（IFD0 / ExifIFD / GPSIFD）
   -------------------------------------------------------------------------- */
interface IfdEntry {
  type: number;
  count: number;
  valueOffset: number;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  const end = Math.min(view.byteLength, offset + length);
  for (let i = offset; i < end; i++) {
    const c = view.getUint8(i);
    if (c === 0) break;
    if (c >= 32 && c <= 126) out += String.fromCharCode(c);
  }
  return out.trim();
}

function readRational(
  view: DataView,
  offset: number,
  little: boolean,
  signed = false
): number | null {
  if (offset + 8 > view.byteLength) return null;
  const num = signed ? view.getInt32(offset, little) : view.getUint32(offset, little);
  const den = signed ? view.getInt32(offset + 4, little) : view.getUint32(offset + 4, little);
  return den ? num / den : null;
}

function parseIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean
): Map<number, IfdEntry> {
  const map = new Map<number, IfdEntry>();
  const dirStart = tiffStart + ifdOffset;
  if (dirStart + 2 > view.byteLength) return map;
  const entries = view.getUint16(dirStart, little);
  for (let i = 0; i < entries; i++) {
    const entryOffset = dirStart + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    map.set(view.getUint16(entryOffset, little), {
      type: view.getUint16(entryOffset + 2, little),
      count: view.getUint32(entryOffset + 4, little),
      valueOffset: entryOffset + 8,
    });
  }
  return map;
}

function getTagString(
  view: DataView,
  tiffStart: number,
  entry: IfdEntry | undefined,
  little: boolean
): string {
  if (!entry || entry.type !== 2) return '';
  if (entry.count <= 4) return readAscii(view, entry.valueOffset, entry.count);
  const strOffset = tiffStart + view.getUint32(entry.valueOffset, little);
  return strOffset < view.byteLength ? readAscii(view, strOffset, entry.count) : '';
}

function getTagUint(view: DataView, entry: IfdEntry | undefined, little: boolean): number | null {
  if (!entry) return null;
  if (entry.type === 3) return view.getUint16(entry.valueOffset, little);
  if (entry.type === 4) return view.getUint32(entry.valueOffset, little);
  return null;
}

function getTagRational(
  view: DataView,
  tiffStart: number,
  entry: IfdEntry | undefined,
  little: boolean,
  signed = false
): number | null {
  if (!entry || (entry.type !== 5 && entry.type !== 10)) return null;
  const rOffset = tiffStart + view.getUint32(entry.valueOffset, little);
  return readRational(view, rOffset, little, signed || entry.type === 10);
}

function getGpsCoord(
  view: DataView,
  tiffStart: number,
  entry: IfdEntry | undefined,
  ref: string,
  little: boolean
): string {
  if (!entry || entry.type !== 5 || entry.count < 3) return '';
  const rOffset = tiffStart + view.getUint32(entry.valueOffset, little);
  const deg = readRational(view, rOffset, little);
  const min = readRational(view, rOffset + 8, little);
  const sec = readRational(view, rOffset + 16, little);
  if (deg === null || min === null) return '';
  return `${Math.floor(deg)}°${String(Math.round(min + (sec ?? 0) / 60)).padStart(2, '0')}'${ref || 'N'}`;
}

export function parseExifFromBuffer(buffer: ArrayBuffer): Partial<PhotoMetadata> {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) return {};
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const segLen = view.getUint16(offset + 2, false);
    if (segLen < 2 || offset + 2 + segLen > view.byteLength) break;
    if (marker === 0xe1 && segLen >= 10 && readAscii(view, offset + 4, 4) === 'Exif') {
      const tiffStart = offset + 10;
      const byteOrder = view.getUint16(tiffStart, false);
      const little = byteOrder === 0x4949;
      if (!little && byteOrder !== 0x4d4d) return {};
      const ifd0 = parseIfd(view, tiffStart, view.getUint32(tiffStart + 4, little), little);
      const make = getTagString(view, tiffStart, ifd0.get(0x010f), little);
      const model = getTagString(view, tiffStart, ifd0.get(0x0110), little);
      const dateTime0 = getTagString(view, tiffStart, ifd0.get(0x0132), little);
      const exifPtr = getTagUint(view, ifd0.get(0x8769), little);
      const gpsPtr = getTagUint(view, ifd0.get(0x8825), little);
      const exifIfd = exifPtr ? parseIfd(view, tiffStart, exifPtr, little) : new Map();
      const gpsIfd = gpsPtr ? parseIfd(view, tiffStart, gpsPtr, little) : new Map();
      const dtOrig = getTagString(view, tiffStart, exifIfd.get(0x9003), little) || dateTime0;
      const lensModel = getTagString(view, tiffStart, exifIfd.get(0xa434), little);
      const fNumber = getTagRational(view, tiffStart, exifIfd.get(0x829d), little);
      const expTime = getTagRational(view, tiffStart, exifIfd.get(0x829a), little);
      const iso = getTagUint(view, exifIfd.get(0x8827), little);
      const focalLen = getTagRational(view, tiffStart, exifIfd.get(0x920a), little);
      const expBias = getTagRational(view, tiffStart, exifIfd.get(0x9204), little, true);
      const out: Partial<PhotoMetadata> = {};
      if (make || model) {
        out.camera = model.toLowerCase().startsWith(make.toLowerCase())
          ? model
          : `${make} ${model}`.trim();
      }
      if (lensModel) out.lens = lensModel;
      else if (focalLen) out.lens = `${Math.round(focalLen)}mm · 光学镜头`;
      const expParts: string[] = [];
      if (fNumber) expParts.push(`f/${fNumber.toFixed(1).replace(/\.0$/, '')}`);
      if (expTime) expParts.push(expTime >= 1 ? `${expTime.toFixed(1)}s` : `1/${Math.round(1 / expTime)}s`);
      if (iso) expParts.push(`ISO ${iso}`);
      if (expParts.length) out.exposure = expParts.join(' · ');
      if (dtOrig) {
        const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})/.exec(dtOrig);
        if (m) out.date = `${chineseFullDate(new Date(`${m[1]}-${m[2]}-${m[3]}`))} · ${m[4]}:${m[5]}`;
      }
      if (expBias !== null) {
        out.ev = `EV ${expBias >= 0 ? '+' : ''}${expBias.toFixed(1)} · OPTICAL METERING`;
      }
      const latRef = getTagString(view, tiffStart, gpsIfd.get(0x0001), little) || 'N';
      const lonRef = getTagString(view, tiffStart, gpsIfd.get(0x0003), little) || 'E';
      const lat = getGpsCoord(view, tiffStart, gpsIfd.get(0x0002), latRef, little);
      const lon = getGpsCoord(view, tiffStart, gpsIfd.get(0x0004), lonRef, little);
      if (lat && lon) out.gps = `${lat} · ${lon}`;
      return out;
    }
    offset += 2 + segLen;
  }
  return {};
}

/**
 * 从用户选中的图片文件读取 EXIF，并用 canvas 采样宽高比 / 16 段亮度直方图。
 * 不含文件本身（file/caption 由调用方填入）。
 */
export async function extractPhotoTelemetryFromFile(
  file: File,
  fallbackDate: string
): Promise<Partial<PhotoMetadata>> {
  let exif: Partial<PhotoMetadata> = {};
  try {
    const buf = await file.arrayBuffer();
    exif = parseExifFromBuffer(buf);
  } catch {
    exif = {};
  }
  if (!exif.date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(file.name);
    const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : fallbackDate;
    if (iso) exif.date = chineseFullDate(new Date(iso));
  }
  try {
    const bmp = await createImageBitmap(file);
    const w = bmp.width;
    const h = bmp.height;
    const ar = Number((w / h).toFixed(4));
    exif.ar = ar;
    if (ar >= 1.55) {
      exif.aspect = `16:9 横幅 (${w}×${h})`;
      exif.ratioPill = '16:9 HORIZONTAL';
    } else if (ar >= 1.1) {
      exif.aspect = `4:3 经典画幅 (${w}×${h})`;
      exif.ratioPill = '4:3 STANDARD';
    } else if (ar <= 0.85) {
      exif.aspect = `3:4 竖幅 (${w}×${h})`;
      exif.ratioPill = '3:4 VERTICAL';
    } else {
      exif.aspect = `1:1 方画幅 (${w}×${h})`;
      exif.ratioPill = '1:1 SQUARE';
    }

    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.drawImage(bmp, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      const bins = new Array(16).fill(0) as number[];
      let lumSum = 0;
      let rSum = 0;
      let bSum = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        lumSum += lum;
        rSum += d[i]!;
        bSum += d[i + 2]!;
        bins[Math.min(15, Math.floor((lum / 256) * 16))]! += 1;
      }
      const maxB = Math.max(...bins, 1);
      exif.hist = bins.map((v) => Math.max(8, Math.round((v / maxB) * 96)));
      if (!exif.ev) {
        const evEst = ((lumSum / 4096 - 128) / 64).toFixed(1);
        exif.ev = `EV ${Number(evEst) >= 0 ? '+' : ''}${evEst} · AUTO HISTOGRAM`;
      }
      if (!exif.color && Math.abs(rSum - bSum) / 4096 > 18) {
        exif.color = rSum > bSum ? 'WARM AMBER // 暖调光谱' : 'COOL CYAN // 冷调光谱';
      }
    }
    bmp.close?.();
  } catch {
    // 浏览器不支持 createImageBitmap 或图片损坏时，保留已读到的 EXIF
  }
  exif.autoFields = EXIF_FIELD_META.filter(
    (m) => exif[m.key] && String(exif[m.key]).trim()
  ).map((m) => m.key);
  return exif;
}
