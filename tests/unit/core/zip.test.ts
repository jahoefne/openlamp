/**
 * The ZIP writer: round-trips through fflate's `unzipSync`, stores STLs
 * uncompressed (level 0) and deflates what asks for a level; the archive's
 * file name.
 */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { archiveFileName, exportStem } from '@core/export/naming.ts';
import { zipFiles } from '@core/export/zip.ts';

interface LocalEntry {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  compressedSize: number;
  size: number;
}

/** The local file headers of a ZIP, in order (fflate writes the sizes into them). */
function localEntries(zip: ArrayBuffer): LocalEntry[] {
  const view = new DataView(zip);
  const bytes = new Uint8Array(zip);
  const out: LocalEntry[] = [];
  let offset = 0;
  while (offset + 30 <= zip.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const size = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = strFromU8(bytes.subarray(offset + 30, offset + 30 + nameLength));
    out.push({ name, method, compressedSize, size });
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return out;
}

/** A fake binary STL: header, count, records (any bytes do for the archive). */
function fakeStl(triangles: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(84 + 50 * triangles);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
  return bytes;
}

describe('zipFiles', () => {
  const hub = fakeStl(40);
  const shade = fakeStl(100);
  const sheet = '# Pendant\n\n| Part | Qty |\n| --- | --: |\n| Hub Ø68.2 × 8 mm | 1 |\n';
  const zip = zipFiles([
    { name: 'openlamp-pendant-hub.stl', data: hub },
    { name: 'openlamp-pendant-shade.stl', data: shade.buffer },
    { name: 'print-sheet.md', data: sheet, level: 6 },
  ]);

  it('writes a ZIP (PK\\x03\\x04) as an ArrayBuffer', () => {
    expect(zip).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(zip, 0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('round-trips with unzipSync: same names, order and bytes; text as UTF-8', () => {
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files)).toEqual([
      'openlamp-pendant-hub.stl',
      'openlamp-pendant-shade.stl',
      'print-sheet.md',
    ]);
    expect(files['openlamp-pendant-hub.stl']).toEqual(hub);
    expect(files['openlamp-pendant-shade.stl']).toEqual(shade);
    expect(strFromU8(files['print-sheet.md']!)).toBe(sheet);
  });

  it('stores the STL entries uncompressed and deflates the text that asks for it', () => {
    const entries = localEntries(zip);
    expect(entries.map((e) => e.name)).toEqual([
      'openlamp-pendant-hub.stl',
      'openlamp-pendant-shade.stl',
      'print-sheet.md',
    ]);
    for (const e of entries.slice(0, 2)) {
      expect(e.method, e.name).toBe(0);
      expect(e.compressedSize, e.name).toBe(e.size);
    }
    expect(entries[0]!.size).toBe(hub.length);
    expect(entries[2]!.method).toBe(8);
  });

  it('applies the archive level to entries without their own', () => {
    const text = 'openlamp '.repeat(200);
    const [entry] = localEntries(zipFiles([{ name: 'a.txt', data: text }], 9));
    expect(entry?.method).toBe(8);
    expect(entry!.compressedSize).toBeLessThan(entry!.size);
  });

  it('refuses duplicate and empty names', () => {
    expect(() =>
      zipFiles([
        { name: 'a.stl', data: hub },
        { name: 'a.stl', data: shade },
      ]),
    ).toThrow(/Two files named a\.stl/);
    expect(() => zipFiles([{ name: '', data: hub }])).toThrow(/name/);
  });

  it('writes an empty archive for no entries', () => {
    expect(Object.keys(unzipSync(new Uint8Array(zipFiles([]))))).toEqual([]);
  });
});

describe('archiveFileName', () => {
  it('is openlamp-<project slug>.<ext>, with the same fallbacks as the part files', () => {
    expect(archiveFileName({ name: 'Pendant on a cord' }, 'zip')).toBe(
      'openlamp-pendant-on-a-cord.zip',
    );
    expect(archiveFileName({ name: '✨', id: 'lamp-abc123' }, 'zip')).toBe(
      'openlamp-lamp-abc123.zip',
    );
    expect(archiveFileName({ name: '' }, 'zip')).toBe('openlamp-project.zip');
    expect(exportStem({ name: 'Bell (default)' })).toBe('openlamp-bell-default');
  });
});
