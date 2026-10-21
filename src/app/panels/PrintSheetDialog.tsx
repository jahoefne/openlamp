/**
 * The print sheet (core/export/printSheet.ts) of the current lamp, rendered
 * from its Markdown with `marked`. Print prints the sheet alone (see the
 * `@media print` rules); Download .md saves the same text the ZIP export
 * carries as print-sheet.md.
 *
 * The Markdown holds text from the project (its name, a custom printer's
 * name), which core escapes; as a second line of defence the renderer shows
 * any raw HTML as text and only links to http(s) URLs.
 */
import { Marked } from 'marked';
import { Dialog } from 'radix-ui';
import { useMemo } from 'react';
import { downloadPrintSheet, printSheetMarkdown } from '../export/exportPipeline.ts';
import { useBuildStore } from '../store/buildStore.ts';
import { useProjectStore } from '../store/projectStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import dialogStyles from './dialog.module.css';
import styles from './PrintSheetDialog.module.css';

const HEX = /^#[0-9a-fA-F]{6}$/;
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

const sheetMarked = new Marked({
  gfm: true,
  renderer: {
    // Raw HTML in the Markdown is shown as text, never parsed.
    html: ({ text }) => escapeHtml(text),
    // A colour (`#rrggbb`) gets a swatch; other code spans render as usual.
    codespan: ({ text }) =>
      HEX.test(text)
        ? `<code class="${styles.hex}"><span class="${styles.swatch}" style="background:${text}"></span>${text}</code>`
        : false,
    // Only http(s) links, opened next to the app.
    link: ({ href, text }) =>
      /^https?:\/\//i.test(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
        : escapeHtml(text),
  },
});

function SheetContent() {
  const project = useProjectStore((s) => s.project);
  const builds = useBuildStore((s) => s.parts);
  const previewOverride = useUiStore((s) => s.previewQuality);
  const markdown = useMemo(
    () => printSheetMarkdown(project, builds, previewOverride),
    [project, builds, previewOverride],
  );
  const html = useMemo(() => sheetMarked.parse(markdown, { async: false }), [markdown]);
  return (
    <>
      <div className={`${dialogStyles.header} ${styles.header}`}>
        <div>
          <Dialog.Title className={dialogStyles.title}>Print sheet</Dialog.Title>
          <Dialog.Description className={dialogStyles.description}>
            Parts, what else you need, assembly steps and printing notes. The ZIP export includes it
            as print-sheet.md.
          </Dialog.Description>
        </div>
        <div className={styles.actions}>
          <button type="button" data-variant="primary" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" onClick={() => downloadPrintSheet(project, markdown)}>
            Download .md
          </button>
          <Dialog.Close className={dialogStyles.close} aria-label="Close">
            ✕
          </Dialog.Close>
        </div>
      </div>
      <div className={`${dialogStyles.body} ${styles.body}`}>
        <article
          className={styles.sheet}
          data-testid="print-sheet"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}

export function PrintSheetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogStyles.overlay} />
        <Dialog.Content className={`${dialogStyles.content} ${styles.content}`} data-print-sheet="">
          {/* Mounted only while open, so the sheet is rendered only then. */}
          <SheetContent />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
