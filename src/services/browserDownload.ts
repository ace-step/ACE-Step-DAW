export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  let didClick = false;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    didClick = true;
  } finally {
    if (didClick) {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      URL.revokeObjectURL(url);
    }
  }
}
