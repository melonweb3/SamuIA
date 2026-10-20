import type { MotionReference } from '../../../packages/avatar-engine/src/index';
import {
  motionReferenceSchema,
  referencePatchSchema,
} from '../../../packages/avatar-engine/src/schemas';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
type ReferenceMetadata = Pick<
  MotionReference,
  'name' | 'emotion' | 'intensity' | 'tags' | 'enabled'
>;
export interface ReferenceRepository {
  list(): Promise<MotionReference[]>;
  upload(file: File, metadata: ReferenceMetadata): Promise<void>;
  update(id: string, patch: ReferenceMetadata): Promise<void>;
  remove(id: string): Promise<void>;
  read(id: string): Promise<Blob>;
}
export class ServerReferenceRepository implements ReferenceRepository {
  private token = '';
  private tokenAt = 0;
  constructor(private onState: (s: StudioSnapshot) => void) {}
  private async request(path: string, init?: RequestInit) {
    const res = await fetch(path, init),
      body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Error de biblioteca');
    return body;
  }
  async list() {
    const s = await this.request('/api/state');
    return s.motionReferences ?? [];
  }
  async upload(file: File, metadata: ReferenceMetadata) {
    const url = '/api/avatar/video?' + new URLSearchParams({ metadata: JSON.stringify(metadata) });
    const state = await this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type':
          file.type ||
          (file.name.endsWith('.webm')
            ? 'video/webm'
            : file.name.endsWith('.mov')
              ? 'video/quicktime'
              : 'video/mp4'),
      },
      body: file,
    });
    this.onState(state);
  }
  async update(id: string, patch: ReferenceMetadata) {
    this.onState(
      await this.request('/api/avatar/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', id, patch }),
      }),
    );
  }
  async remove(id: string) {
    this.onState(
      await this.request('/api/avatar/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      }),
    );
  }
  async read(id: string) {
    if (!this.token || Date.now() - this.tokenAt > 540000) {
      const result = await this.request('/api/avatar/private-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      this.token = result.token;
      this.tokenAt = Date.now();
    }
    const res = await fetch(`/api/avatar/video?id=${encodeURIComponent(id)}`, {
      headers: { 'X-Avatar-Session': this.token },
    });
    if (!res.ok) throw new Error('No se pudo abrir la referencia privada');
    return res.blob();
  }
}
function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('samuia-reaction-studio-v9', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('metadata', { keyPath: 'id' });
      req.result.createObjectStore('videos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('No se pudo abrir la biblioteca local de vídeos'));
  });
}
export class BrowserReferenceRepository implements ReferenceRepository {
  private async store<T>(
    names: string[],
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => IDBRequest<T>,
  ) {
    const db = await openDatabase();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(names, mode),
          request = work(tx);
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(new Error('No se pudo guardar o leer el vídeo local'));
        tx.onabort = () => reject(new Error('La operación local se canceló'));
      });
    } finally {
      db.close();
    }
  }
  async list() {
    const records = await this.store(['metadata'], 'readonly', (tx) =>
      tx.objectStore('metadata').getAll(),
    );
    return records.map((r) => motionReferenceSchema.parse(r));
  }
  async upload(file: File, metadata: ReferenceMetadata) {
    const parsed = referencePatchSchema.parse(metadata),
      records = await this.list();
    if (
      !file.size ||
      file.size > 100 * 1024 * 1024 ||
      records.length >= 60 ||
      records.reduce((n, r) => n + r.bytes, 0) + file.size > 1024 * 1024 * 1024
    )
      throw new Error('Límite de referencias: 100 MiB por vídeo, 60 vídeos y 1 GiB total');
    const mime =
      file.type ||
      (file.name.toLowerCase().endsWith('.webm')
        ? 'video/webm'
        : file.name.toLowerCase().endsWith('.mov')
          ? 'video/quicktime'
          : 'video/mp4');
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mime))
      throw new Error('Formato no admitido');
    const magic = new Uint8Array(await file.slice(0, 16).arrayBuffer()),
      ftyp = String.fromCharCode(...magic.slice(4, 8)) === 'ftyp',
      webm = [26, 69, 223, 163].every((b, i) => magic[i] === b);
    if ((!ftyp && !webm) || (mime === 'video/webm' && !webm) || (mime !== 'video/webm' && !ftyp))
      throw new Error('Firma o MIME de vídeo inválidos');
    const url = URL.createObjectURL(file);
    let duration: number;
    try {
      duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video'),
          timer = setTimeout(() => {
            video.removeAttribute('src');
            reject(new Error('No se pudo analizar el vídeo'));
          }, 10000);
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve(video.duration);
          video.removeAttribute('src');
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('El navegador no admite este vídeo'));
        };
        video.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    const reference = motionReferenceSchema.parse({
      ...parsed,
      id: crypto.randomUUID(),
      type: 'video',
      sourceKind: 'reference-video',
      duration,
      status: 'pending-motion',
      createdAt: Date.now(),
      mime,
      bytes: file.size,
    });
    await this.store(['metadata', 'videos'], 'readwrite', (tx) => {
      tx.objectStore('videos').put(file, reference.id);
      return tx.objectStore('metadata').put(reference);
    });
  }
  async update(id: string, patch: ReferenceMetadata) {
    const ref = (await this.list()).find((r) => r.id === id);
    if (!ref) throw new Error('Referencia no encontrada');
    await this.store(['metadata'], 'readwrite', (tx) =>
      tx.objectStore('metadata').put({ ...ref, ...referencePatchSchema.parse(patch) }),
    );
  }
  async remove(id: string) {
    await this.store(['metadata', 'videos'], 'readwrite', (tx) => {
      tx.objectStore('videos').delete(id);
      return tx.objectStore('metadata').delete(id);
    });
  }
  async read(id: string) {
    const blob = await this.store(['videos'], 'readonly', (tx) => tx.objectStore('videos').get(id));
    if (!(blob instanceof Blob)) throw new Error('Archivo local no disponible');
    return blob;
  }
}
