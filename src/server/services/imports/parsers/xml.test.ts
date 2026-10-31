import { describe, expect, it } from 'vitest';
import { UnreadableFileError } from './types';
import { child, childrenNamed, MAX_XML_LENGTH, parseXml, textAt } from './xml';

describe('XML reader', () => {
  it('decodes the predefined entities and character references in text and attributes', () => {
    const root = parseXml(
      '<Doc note="a &amp; b &quot;c&quot;">Caf&#233; &#x20AC; &lt;1&gt; &apos;x&apos;</Doc>',
    );

    expect(root.text).toBe("Café € <1> 'x'");
    expect(root.attributes.note).toBe('a & b "c"');
  });

  it('refuses unknown entities, stray ampersands and out-of-range character references', () => {
    expect(() => parseXml('<Doc>&nbsp;</Doc>')).toThrow('it has an unknown entity "&nbsp;"');
    expect(() => parseXml('<Doc>Coop & Migros</Doc>')).toThrow('it has a stray "&"');
    expect(() => parseXml('<Doc>&#x110000;</Doc>')).toThrow('invalid character reference');
  });

  it('keeps CDATA verbatim, entities and markup included', () => {
    const root = parseXml('<Doc>a <![CDATA[<b>&amp;</b>]]> c</Doc>');

    expect(root.text).toBe('a <b>&amp;</b> c');
  });

  it('drops element namespace prefixes but keeps namespace declarations', () => {
    const root = parseXml(
      '<ns:Document xmlns:ns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.04">' +
        '<ns:Stmt><ns:Ntry>1</ns:Ntry><Ntry>2</Ntry></ns:Stmt></ns:Document>',
    );

    expect(root.name).toBe('Document');
    expect(root.attributes['xmlns:ns']).toContain('camt.053');
    expect(childrenNamed(child(root, 'Stmt'), 'Ntry').map((entry) => entry.text)).toEqual([
      '1',
      '2',
    ]);
    expect(textAt(root, 'Stmt', 'Ntry')).toBe('1');
  });

  it('refuses a document type declaration, so no entity can be defined or expanded', () => {
    expect(() => parseXml('<!DOCTYPE d [<!ENTITY x "boom">]><Doc>&x;</Doc>')).toThrow(
      'it has a document type declaration, which is not allowed',
    );
  });

  it('refuses input over the size limit with a clear message', () => {
    const tooLong = `<Doc>${'a'.repeat(MAX_XML_LENGTH)}</Doc>`;

    expect(() => parseXml(tooLong)).toThrow(UnreadableFileError);
    expect(() => parseXml(tooLong)).toThrow(
      `it is too large to read as XML (over ${MAX_XML_LENGTH / 1024 / 1024} MB of text)`,
    );
  });

  it('refuses mismatched or unclosed tags', () => {
    expect(() => parseXml('<a><b></a>')).toThrow('the closing tag </a> does not match');
    expect(() => parseXml('<a><b>')).toThrow('the tag <b> is not closed');
  });
});
