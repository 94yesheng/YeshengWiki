/**
 * 音频元数据：从文件名 / 本地文件 / URL 读取「标题 + 作者」。
 *
 * 供文章编辑器的伴读音乐卡片使用（媒体库选曲、本地上传），前台右栏音乐卡也会
 * 用文件名兜底展示。支持 ID3v2 / ID3v1、FLAC Vorbis Comment、MP4/M4A ilst 标签；
 * 解析失败时一律回退到文件名猜测，不抛异常。
 */

export interface AudioMetadata {
  title: string;
  artist: string;
  album?: string;
}

/** 编辑器的占位曲名/作者：视为「未填写」，可以被标签值覆盖。 */
const DEFAULT_TITLES = ['伴读音乐 · 未命名曲目', '未命名伴读曲目', '未命名曲目'];
const DEFAULT_ARTISTS = ['夜笙 · ACOUSTIC BGM', 'ACOUSTIC STREAM // 伴读声轨', '伴读声轨'];

const norm = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

export function isDefaultAudioTitle(value: unknown): boolean {
  const text = norm(value);
  return !text || DEFAULT_TITLES.includes(text);
}

export function isDefaultAudioArtist(value: unknown): boolean {
  const text = norm(value);
  return !text || DEFAULT_ARTISTS.includes(text);
}

function basename(input: string): string {
  let text = String(input ?? '').split(/[?#]/)[0];
  const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  if (slash >= 0) text = text.slice(slash + 1);
  try {
    text = decodeURIComponent(text);
  } catch {
    /* 保留原样 */
  }
  return text;
}

function stripExtension(name: string): string {
  return name.replace(/\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|wma|ape|aiff?)$/i, '');
}

/** 从文件名/路径猜标题与作者，例如 `周杰伦 - 晴天.mp3` → 作者 周杰伦、标题 晴天。 */
export function parseAudioMetadataFromFilename(raw: string): AudioMetadata {
  const base = stripExtension(basename(raw))
    .replace(/_/g, ' ')
    .replace(/^\d{10,14}[-_\s]*/, '')
    .replace(/^\s*\d{1,3}\s*[.\-、]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) return { title: '', artist: '' };

  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const artist = norm(parts[0]);
    const title = norm(parts.slice(1).join(' - '));
    if (artist && title) return { title, artist };
  }
  return { title: base, artist: '' };
}

/* -------------------------------------------------------------------------- */
/* 二进制标签解析                                                              */
/* -------------------------------------------------------------------------- */

const readAscii = (bytes: Uint8Array, start: number, length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const code = bytes[start + i];
    if (!code) break;
    out += String.fromCharCode(code);
  }
  return out;
};

const synchsafe = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] & 0x7f) << 21) |
  ((bytes[offset + 1] & 0x7f) << 14) |
  ((bytes[offset + 2] & 0x7f) << 7) |
  (bytes[offset + 3] & 0x7f);

const u32be = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] << 24) >>> 0) +
  (bytes[offset + 1] << 16) +
  (bytes[offset + 2] << 8) +
  bytes[offset + 3];

const u32le = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + ((bytes[offset + 3] << 24) >>> 0);

function decodeText(bytes: Uint8Array, start: number, end: number, encoding: number): string {
  let chunk = bytes.subarray(start, end);
  // 去掉尾部填充的 0
  let stop = chunk.length;
  while (stop > 0 && chunk[stop - 1] === 0) stop -= 1;
  chunk = chunk.subarray(0, stop);
  if (!chunk.length) return '';

  try {
    if (encoding === 1) {
      const bigEndian = chunk[0] === 0xfe && chunk[1] === 0xff;
      const littleEndian = chunk[0] === 0xff && chunk[1] === 0xfe;
      const body = bigEndian || littleEndian ? chunk.subarray(2) : chunk;
      return norm(new TextDecoder(bigEndian ? 'utf-16be' : 'utf-16le').decode(body).replace(/\u0000/g, ''));
    }
    if (encoding === 2) return norm(new TextDecoder('utf-16be').decode(chunk).replace(/\u0000/g, ''));
    if (encoding === 3) return norm(new TextDecoder('utf-8').decode(chunk).replace(/\u0000/g, ''));
    // encoding === 0 (ISO-8859-1 / 历史中文 MP3 常见的 UTF-8 或 GB18030 标签)
    try {
      return norm(new TextDecoder('utf-8', { fatal: true }).decode(chunk).replace(/\u0000/g, ''));
    } catch {
      try {
        return norm(new TextDecoder('gb18030').decode(chunk).replace(/\u0000/g, ''));
      } catch {
        return norm(new TextDecoder('latin1').decode(chunk).replace(/\u0000/g, ''));
      }
    }
  } catch {
    return '';
  }
}

function parseId3v2(bytes: Uint8Array): AudioMetadata {
  const out: AudioMetadata = { title: '', artist: '' };
  if (bytes.length < 10 || readAscii(bytes, 0, 3) !== 'ID3') return out;

  const version = bytes[3];
  let offset = 10;
  const tagSize = synchsafe(bytes, 6);
  const tagEnd = Math.min(bytes.length, 10 + tagSize);

  // 扩展头（v2.3 / v2.4）
  if (version >= 3 && bytes[5] & 0x40) {
    const extSize = version === 3 ? u32be(bytes, offset) + 4 : synchsafe(bytes, offset);
    offset += extSize;
  }

  const field = (id: string): 'title' | 'artist' | 'album' | null =>
    id === 'TIT2' || id === 'TT2'
      ? 'title'
      : id === 'TPE1' || id === 'TPE2' || id === 'TP1'
        ? 'artist'
        : id === 'TALB' || id === 'TAL1'
          ? 'album'
          : null;

  const idLength = version === 2 ? 3 : 4;
  const headerLength = version === 2 ? 6 : 10;

  while (offset + headerLength <= tagEnd) {
    const id = readAscii(bytes, offset, idLength);
    if (!id || !/^[A-Z0-9]+$/.test(id)) break;

    const size =
      version === 2
        ? (bytes[offset + 3] << 16) + (bytes[offset + 4] << 8) + bytes[offset + 5]
        : version === 4
          ? synchsafe(bytes, offset + 4)
          : u32be(bytes, offset + 4);

    const dataStart = offset + headerLength;
    const key = field(id);
    if (key && size > 1 && dataStart + size <= bytes.length && !out[key]) {
      const value = decodeText(bytes, dataStart + 1, dataStart + size, bytes[dataStart]);
      if (value) out[key] = value;
    }
    offset = dataStart + size;
    if (size <= 0) break;
  }

  return out;
}

function parseId3v1(bytes: Uint8Array): AudioMetadata {
  const out: AudioMetadata = { title: '', artist: '' };
  if (bytes.length < 128) return out;
  const start = bytes.length - 128;
  if (readAscii(bytes, start, 3) !== 'TAG') return out;

  out.title = decodeText(bytes, start + 3, start + 33, 0);
  out.artist = decodeText(bytes, start + 33, start + 63, 0);
  return out;
}

function parseFlac(bytes: Uint8Array): AudioMetadata {
  const out: AudioMetadata = { title: '', artist: '' };
  if (bytes.length < 8 || readAscii(bytes, 0, 4) !== 'fLaC') return out;

  let offset = 4;
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset];
    const isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    const body = offset + 4;

    if (type === 4 && body + length <= bytes.length) {
      let p = body;
      const vendorLength = u32le(bytes, p);
      p += 4 + vendorLength;
      if (p + 4 > body + length) return out;
      const count = u32le(bytes, p);
      p += 4;
      for (let i = 0; i < count && p + 4 <= body + length; i += 1) {
        const itemLength = u32le(bytes, p);
        p += 4;
        if (p + itemLength > body + length) break;
        const item = new TextDecoder('utf-8').decode(bytes.subarray(p, p + itemLength));
        p += itemLength;
        const eq = item.indexOf('=');
        if (eq <= 0) continue;
        const key = item.slice(0, eq).toUpperCase();
        const value = norm(item.slice(eq + 1));
        if (key === 'TITLE' && value) out.title = value;
        if (key === 'ARTIST' && value) out.artist = value;
        if (key === 'ALBUM' && value) out.album = value;
      }
      return out;
    }
    if (isLast) break;
    offset = body + length;
  }
  return out;
}

function findBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  name: string
): { body: number; end: number } | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = u32be(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    if (size < 8) return null;
    const body = offset + 8;
    const boxEnd = Math.min(end, offset + size);
    if (type === name) return { body, end: boxEnd };
    offset = body + size - 8;
  }
  return null;
}

function mp4Text(bytes: Uint8Array, item: { body: number; end: number }): string {
  const data = findBox(bytes, item.body, item.end, 'data');
  if (!data) return '';
  // data box: version/flags(4) + locale(4) + payload
  const start = data.body + 8;
  if (start >= data.end) return '';
  try {
    return norm(new TextDecoder('utf-8').decode(bytes.subarray(start, data.end)).replace(/\u0000/g, ''));
  } catch {
    return '';
  }
}

function parseMp4(bytes: Uint8Array): AudioMetadata {
  const out: AudioMetadata = { title: '', artist: '' };
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (!moov) return out;
  const udta = findBox(bytes, moov.body, moov.end, 'udta');
  if (!udta) return out;
  const meta = findBox(bytes, udta.body, udta.end, 'meta');
  if (!meta) return out;
  // meta 有 4 字节 version/flags
  const ilst = findBox(bytes, meta.body + 4, meta.end, 'ilst');
  if (!ilst) return out;

  const grab = (name: string): string => {
    const item = findBox(bytes, ilst.body, ilst.end, name);
    return item ? mp4Text(bytes, item) : '';
  };

  out.title = grab('\u00a9nam') || grab('titl');
  out.artist = grab('\u00a9ART') || grab('artt');
  out.album = grab('\u00a9alb') || undefined;
  return out;
}

function sniff(bytes: Uint8Array, nameHint: string): AudioMetadata {
  const head = readAscii(bytes, 0, 4);
  const ext = (nameHint.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();

  if (head.startsWith('ID3')) return parseId3v2(bytes);
  if (head === 'fLaC' || ext === 'flac') return parseFlac(bytes);
  if (ext === 'm4a' || ext === 'mp4' || readAscii(bytes, 4, 4) === 'ftyp') return parseMp4(bytes);

  const v2 = parseId3v2(bytes);
  if (v2.title || v2.artist) return v2;
  return parseId3v1(bytes);
}

/* -------------------------------------------------------------------------- */
/* 对外接口                                                                    */
/* -------------------------------------------------------------------------- */

export function parseAudioTagBuffer(
  buffer: ArrayBuffer | Uint8Array,
  nameHint = ''
): AudioMetadata {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return sniff(bytes, nameHint);
}

export async function extractAudioMetadataFromFile(file: File): Promise<AudioMetadata> {
  const guess = parseAudioMetadataFromFilename(file?.name ?? '');
  if (!file || typeof file.arrayBuffer !== 'function') return guess;
  try {
    const buffer = await file.arrayBuffer();
    const parsed = sniff(new Uint8Array(buffer), file.name ?? '');
    return {
      title: parsed.title || guess.title,
      artist: parsed.artist || guess.artist,
      album: parsed.album,
    };
  } catch {
    return guess;
  }
}

export async function extractAudioMetadataFromUrl(
  url: string,
  filename?: string
): Promise<AudioMetadata> {
  const guess = parseAudioMetadataFromFilename(filename || url || '');
  const target = String(url ?? '').trim();
  if (!target || typeof fetch !== 'function') return guess;
  try {
    const response = await fetch(target, {
      credentials: 'same-origin',
      headers: { Range: 'bytes=0-65535' },
    });
    if (!response.ok) return guess;
    const buffer = await response.arrayBuffer();
    const parsed = sniff(new Uint8Array(buffer), filename || target);
    return {
      title: parsed.title || guess.title,
      artist: parsed.artist || guess.artist,
      album: parsed.album,
    };
  } catch {
    return guess;
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__YeshengAudioMeta = {
    parseAudioTagBuffer,
    parseAudioMetadataFromFilename,
    extractAudioMetadataFromFile,
    extractAudioMetadataFromUrl,
  };
}
