/** Hand a dropped file from the library to the "new transcription" page. */
let pending: File | null = null;

export function setPendingFile(file: File | null) {
  pending = file;
}

export function takePendingFile(): File | null {
  const f = pending;
  pending = null;
  return f;
}
