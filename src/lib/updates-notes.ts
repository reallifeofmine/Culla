/** Lines starting with "-", "*" or "•" in release notes become dot points. */
export function bullets(body: string): string[] {
  return body.split(/\r?\n/).map(l => l.trim()).filter(l => /^[-*•]\s+/.test(l)).map(l => l.replace(/^[-*•]\s+/, ''));
}
