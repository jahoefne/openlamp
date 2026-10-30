const LETTERS: Readonly<Record<string, string>> = { a: 'å', A: 'Å', o: 'ø', O: 'Ø' };

/** Decorative Nordic lettering for the wordmark and editorial titles only. */
export function nordicLettering(text: string): string {
  return text.replace(/[aAoO]/g, (letter) => LETTERS[letter] ?? letter);
}

export const WORDMARK = nordicLettering('openlamp');
