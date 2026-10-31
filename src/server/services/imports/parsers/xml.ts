import { decodeEntities } from './text';
import { UnreadableFileError } from './types';

/**
 * A small, strict XML reader for bank statements: elements, attributes, text, CDATA, comments
 * and processing instructions. Element namespace prefixes are dropped (`ns:Ntry` is `Ntry`);
 * attribute names are kept whole (`xmlns:ns`). Only the predefined entities and character
 * references are decoded; document type declarations are refused, so no entity can be defined
 * or expanded. Input over MAX_XML_LENGTH characters is refused before parsing. The parse is
 * iterative, so deep nesting cannot overflow the stack. Throws `UnreadableFileError`.
 */

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** The element's own text (not its children's), entities decoded, untrimmed. */
  readonly text: string;
}

interface MutableElement {
  name: string;
  attributes: Record<string, string>;
  children: MutableElement[];
  text: string;
}

const NAME = /[A-Za-z_][\w.:-]*/y;
const ATTRIBUTE = /\s+([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
/** Larger than any bank statement the Import accepts (5 MB), so only junk is refused. */
export const MAX_XML_LENGTH = 8 * 1024 * 1024;

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

function skipTo(xml: string, from: number, terminator: string, what: string): number {
  const end = xml.indexOf(terminator, from);
  if (end < 0) throw new UnreadableFileError(`${what} is not closed`);
  return end + terminator.length;
}

/** Reads one start tag at `pos` (just after `<`). Returns the element and the position after `>`. */
function readStartTag(
  xml: string,
  pos: number,
): { element: MutableElement; selfClosing: boolean; next: number } {
  NAME.lastIndex = pos;
  const nameMatch = NAME.exec(xml);
  if (!nameMatch) throw new UnreadableFileError('it is not well-formed XML');
  let cursor = pos + nameMatch[0].length;
  const attributes: Record<string, string> = {};
  for (;;) {
    ATTRIBUTE.lastIndex = cursor;
    const attribute = ATTRIBUTE.exec(xml);
    if (!attribute) break;
    attributes[attribute[1]!] = decodeEntities(attribute[3] ?? attribute[4] ?? '');
    cursor += attribute[0].length;
  }
  while (/\s/.test(xml[cursor] ?? '')) cursor++;
  const selfClosing = xml.startsWith('/>', cursor);
  if (!selfClosing && xml[cursor] !== '>') {
    throw new UnreadableFileError(`the tag <${nameMatch[0]}> is not well-formed`);
  }
  return {
    element: { name: localName(nameMatch[0]), attributes, children: [], text: '' },
    selfClosing,
    next: cursor + (selfClosing ? 2 : 1),
  };
}

export function parseXml(xml: string): XmlElement {
  if (xml.length > MAX_XML_LENGTH) {
    throw new UnreadableFileError(
      `it is too large to read as XML (over ${MAX_XML_LENGTH / 1024 / 1024} MB of text)`,
    );
  }
  const stack: MutableElement[] = [];
  let root: MutableElement | null = null;
  let pos = 0;
  while (pos < xml.length) {
    const lt = xml.indexOf('<', pos);
    const textEnd = lt < 0 ? xml.length : lt;
    const text = xml.slice(pos, textEnd);
    const parent = stack.at(-1);
    if (parent) parent.text += decodeEntities(text);
    else if (text.trim() !== '') throw new UnreadableFileError('it has text outside the root');
    if (lt < 0) break;

    if (xml.startsWith('<!--', lt)) {
      pos = skipTo(xml, lt + 4, '-->', 'a comment');
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = skipTo(xml, lt + 9, ']]>', 'a CDATA section');
      if (!parent) throw new UnreadableFileError('it has text outside the root');
      parent.text += xml.slice(lt + 9, end - 3);
      pos = end;
    } else if (xml.startsWith('<?', lt)) {
      pos = skipTo(xml, lt + 2, '?>', 'a processing instruction');
    } else if (xml.startsWith('<!', lt)) {
      throw new UnreadableFileError('it has a document type declaration, which is not allowed');
    } else if (xml.startsWith('</', lt)) {
      const end = skipTo(xml, lt + 2, '>', 'a closing tag');
      const name = localName(xml.slice(lt + 2, end - 1).trim());
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new UnreadableFileError(`the closing tag </${name}> does not match`);
      }
      pos = end;
    } else {
      if (!parent && root) throw new UnreadableFileError('it has more than one root element');
      const { element, selfClosing, next } = readStartTag(xml, lt + 1);
      if (parent) parent.children.push(element);
      else root = element;
      if (!selfClosing) stack.push(element);
      pos = next;
    }
  }
  if (stack.length > 0)
    throw new UnreadableFileError(`the tag <${stack.at(-1)!.name}> is not closed`);
  if (!root) throw new UnreadableFileError('it has no XML root element');
  return root;
}

/** The first child at this path of local names, or null. */
export function child(element: XmlElement | null, ...path: string[]): XmlElement | null {
  let current = element;
  for (const name of path) {
    if (!current) return null;
    current = current.children.find((candidate) => candidate.name === name) ?? null;
  }
  return current;
}

/** Every direct child with this local name. */
export function childrenNamed(element: XmlElement | null, name: string): XmlElement[] {
  return element ? element.children.filter((candidate) => candidate.name === name) : [];
}

/** The trimmed text at this path, or null when absent or blank. */
export function textAt(element: XmlElement | null, ...path: string[]): string | null {
  const text = child(element, ...path)?.text.trim() ?? '';
  return text === '' ? null : text;
}
