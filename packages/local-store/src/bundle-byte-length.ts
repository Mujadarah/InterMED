/** UTF-8 byte length of bundle text, as reported by a publisher's byteSize. */
export function bundleByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
