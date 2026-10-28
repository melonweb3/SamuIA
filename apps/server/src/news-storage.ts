import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
/** Same lightweight JSON storage pattern as Voice Studio, with a versioned envelope and atomic replacement. */
export class NewsStorage {
  error: string | null = null;
  private last = '';
  constructor(readonly file: string | null) {}
  load(): unknown {
    if (!this.file || !existsSync(this.file)) return null;
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8'));
      if (value.version !== 1) throw Error('unsupported-version');
      return value.data;
    } catch {
      this.error =
        'No se pudo recuperar el almacenamiento de noticias. Se conserva el archivo original.';
      return null;
    }
  }
  save(data: unknown) {
    if (!this.file || this.error) return;
    const text = JSON.stringify({ version: 1, data });
    if (text === this.last) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      writeFileSync(this.file + '.tmp', text, { mode: 0o600 });
      renameSync(this.file + '.tmp', this.file);
      this.last = text;
    } catch {
      this.error = 'No se pudo guardar la configuración de noticias.';
    }
  }
}
