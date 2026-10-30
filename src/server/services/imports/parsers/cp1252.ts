/**
 * Windows-1252 decoding. Node's `TextDecoder('windows-1252')` follows ICU's Latin-1 mapping
 * when built without full ICU and reads 0x80–0x9F as C1 controls, so `€` (0x80) comes out as
 * U+0080. This table gives those 32 bytes their Windows-1252 characters; every other byte is
 * the Latin-1 code point. The five bytes Windows-1252 leaves undefined keep their C1 value.
 */
const C1 = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc,
  0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

export function decodeWindows1252(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? C1[byte - 0x80]! : byte);
  }
  return text;
}
