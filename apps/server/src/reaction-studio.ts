import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, chmod, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  defaultAvatarSettings,
  builtInReactions,
  type AvatarEngineSettings,
  type ReactionAsset,
  type MotionReference,
} from '../../../packages/avatar-engine/src/index';
import {
  avatarLibrarySchema,
  referencePatchSchema,
} from '../../../packages/avatar-engine/src/schemas';
import type { ReactionDirector } from '../../../packages/core/src/index';
const exec = promisify(execFile);
export class ReactionStudioService {
  readonly ready: Promise<void>;
  private settings = structuredClone(defaultAvatarSettings);
  private assets = structuredClone(builtInReactions);
  private references: MotionReference[] = [];
  private error: string | null = null;
  private saving = Promise.resolve();
  private memory = new Map<string, Buffer>();
  private sessions = new Map<string, number>();
  private directory: string | null;
  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    options: { directory?: string | null } = {},
  ) {
    this.directory =
      options.directory === undefined
        ? resolve(env.AVATAR_STORAGE_DIR || '.local/avatar-studio')
        : options.directory;
    this.ready = this.load();
  }
  private async load() {
    if (!this.directory) return;
    try {
      const bytes = await readFile(join(this.directory, 'library.json'));
      if (bytes.length > 1024 * 1024) throw new Error();
      const saved = avatarLibrarySchema.parse(JSON.parse(bytes.toString()));
      this.settings = saved.settings;
      this.assets = saved.assets;
      this.references = saved.references;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.error = 'No se pudo leer la biblioteca privada de reacciones';
    }
  }
  private async persist() {
    if (!this.directory) return;
    const data = JSON.stringify(
        { version: 1, settings: this.settings, assets: this.assets, references: this.references },
        null,
        2,
      ),
      dir = this.directory;
    this.saving = this.saving
      .catch(() => {})
      .then(async () => {
        let file: string | undefined;
        try {
          await mkdir(dir, { recursive: true, mode: 0o700 });
          await chmod(dir, 0o700);
          file = join(dir, `library-${randomUUID()}.tmp`);
          await writeFile(file, data, { mode: 0o600 });
          await rename(file, join(dir, 'library.json'));
          this.error = null;
        } catch {
          if (file) await rm(file, { force: true });
          this.error = 'No se pudo guardar la biblioteca privada de reacciones';
          throw new Error(this.error);
        }
      });
    await this.saving;
  }
  apply(director: ReactionDirector) {
    director.animation.configure(this.settings);
    director.settings.avatarEngine = structuredClone(this.settings);
    director.animation.library.replace(this.assets);
  }
  async capture(director: ReactionDirector) {
    this.settings = structuredClone(director.animation.settings);
    this.assets = director.animation.library.snapshot();
    for (const a of this.assets)
      if (a.videoReferenceId && !this.references.some((r) => r.id === a.videoReferenceId))
        throw new Error('La referencia vinculada no existe');
    await this.persist();
  }
  snapshot() {
    return { motionReferences: structuredClone(this.references), avatarStorageError: this.error };
  }
  private file(id: string) {
    if (!this.directory) throw new Error('Almacenamiento en memoria');
    return join(this.directory, 'references', `${id}.bin`);
  }
  session() {
    for (const [id, until] of this.sessions) if (Date.now() > until) this.sessions.delete(id);
    if (this.sessions.size >= 16) throw new Error('Demasiadas sesiones de referencia');
    const id = randomUUID();
    this.sessions.set(id, Date.now() + 600000);
    return id;
  }
  private authorized(token: string) {
    return (this.sessions.get(token) ?? 0) > Date.now();
  }
  async video(id: string, token: string) {
    if (!this.settings.videoReferenceEnabled || !this.authorized(token))
      throw new Error('Sesión privada de referencias no válida');
    const reference = this.references.find((r) => r.id === id);
    if (!reference) throw new Error('Referencia no encontrada');
    const bytes = this.directory ? await readFile(this.file(id)) : this.memory.get(id);
    if (!bytes) throw new Error('Archivo de referencia no disponible');
    return { bytes, mime: reference.mime };
  }
  async upload(data: Buffer, mime: string, metadata: unknown) {
    if (!this.settings.videoReferenceEnabled)
      throw new Error('La biblioteca de vídeo está desactivada');
    const parsed = referencePatchSchema.parse(metadata);
    if (
      !['video/mp4', 'video/webm', 'video/quicktime'].includes(mime) ||
      !data.length ||
      data.length > 100 * 1024 * 1024
    )
      throw new Error('Formato o tamaño de vídeo no permitido');
    if (
      this.references.length >= 60 ||
      this.references.reduce((n, r) => n + r.bytes, 0) + data.length > 1024 * 1024 * 1024
    )
      throw new Error('Límite de almacenamiento de referencias alcanzado');
    const magic = data.subarray(0, 16);
    if (
      magic.toString('ascii', 4, 8) !== 'ftyp' &&
      !magic.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    )
      throw new Error('La firma no corresponde a un vídeo admitido');
    const id = randomUUID(),
      temporary = resolve('/tmp', `samuia-reference-${id}`);
    let stored = false;
    try {
      await writeFile(temporary, data, { mode: 0o600 });
      const { stdout } = await exec(
        this.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_entries',
          'format=duration,format_name:stream=codec_type,width,height',
          '-of',
          'json',
          temporary,
        ],
        { timeout: 10000, maxBuffer: 65536 },
      );
      const info = JSON.parse(stdout),
        duration = Number(info.format?.duration),
        video = info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video'),
        format = String(info.format?.format_name ?? '');
      if (
        !video ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 86400 ||
        video.width > 7680 ||
        video.height > 7680
      )
        throw new Error('Contenido de vídeo o duración no válidos');
      if (
        (mime === 'video/webm') !== format.includes('matroska') &&
        (mime === 'video/webm') !== format.includes('webm')
      )
        throw new Error('El MIME no coincide con el contenedor de vídeo');
      if (mime !== 'video/webm' && !format.includes('mov') && !format.includes('mp4'))
        throw new Error('El MIME no coincide con el contenedor de vídeo');
      const reference: MotionReference = {
        ...parsed,
        id,
        type: 'video',
        sourceKind: 'reference-video',
        duration,
        status: 'pending-motion',
        createdAt: Date.now(),
        mime,
        bytes: data.length,
      };
      if (this.directory) {
        await mkdir(join(this.directory, 'references'), { recursive: true, mode: 0o700 });
        await chmod(this.directory, 0o700);
        await writeFile(this.file(id), data, { mode: 0o600 });
        stored = true;
      } else this.memory.set(id, data);
      this.references.push(reference);
      try {
        await this.persist();
      } catch (error) {
        this.references = this.references.filter((r) => r.id !== id);
        if (stored) await rm(this.file(id), { force: true });
        this.memory.delete(id);
        throw error;
      }
      return reference;
    } catch (error) {
      if (error instanceof Error && !('stderr' in error)) throw error;
      throw new Error('No se pudo validar el vídeo de referencia');
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async updateReference(id: string, patch: unknown) {
    const ref = this.references.find((r) => r.id === id);
    if (!ref) throw new Error('Referencia no encontrada');
    Object.assign(ref, referencePatchSchema.parse(patch));
    await this.persist();
  }
  async removeReference(id: string) {
    const ref = this.references.find((r) => r.id === id);
    if (!ref) throw new Error('Referencia no encontrada');
    this.references = this.references.filter((r) => r.id !== id);
    this.assets = this.assets.map((a) =>
      a.videoReferenceId === id
        ? {
            ...a,
            videoReferenceId: undefined,
            source: 'placeholder',
            status: 'placeholder',
            enabled: false,
          }
        : a,
    );
    await this.persist();
    if (this.directory) {
      try {
        await stat(this.file(id));
        await rm(this.file(id), { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('No se pudo borrar el archivo de referencia');
      }
    }
    this.memory.delete(id);
  }
  get config(): { settings: AvatarEngineSettings; assets: ReactionAsset[] } {
    return { settings: structuredClone(this.settings), assets: structuredClone(this.assets) };
  }
}
