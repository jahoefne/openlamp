/**
 * Hand a file to the browser as a download.
 */
export interface DownloadFile {
  name: string;
  data: ArrayBuffer | string;
  mime: string;
}

export function downloadFile(file: DownloadFile): void {
  const blob = new Blob([file.data], { type: file.mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
