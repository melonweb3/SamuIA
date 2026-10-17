import type { Camera, Scene } from '../../shared/src/index';
export interface OBSController {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setScene(scene: Scene): Promise<void>;
  setSource(name: string, visible: boolean): Promise<void>;
  setCamera(camera: Camera): Promise<void>;
  setVirtualCamera(enabled: boolean): Promise<void>;
  setOverlay(name: string, data: Record<string, unknown>): Promise<void>;
  showAlert(text: string): Promise<void>;
  setLighting(color: string): Promise<void>;
  setAvatar(asset: string): Promise<void>;
}
export class MockOBSController implements OBSController {
  connected = false;
  commands: { method: string; value: unknown }[] = [];
  private record(method: string, value: unknown) {
    if (!this.connected) throw new Error('OBS mock desconectado');
    this.commands.push({ method, value });
  }
  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  async setScene(v: Scene) {
    this.record('scene', v);
  }
  async setSource(name: string, visible: boolean) {
    this.record('source', { name, visible });
  }
  async setCamera(v: Camera) {
    this.record('camera', v);
  }
  async setVirtualCamera(v: boolean) {
    this.record('virtualCamera', v);
  }
  async setOverlay(name: string, data: Record<string, unknown>) {
    this.record('overlay', { name, data });
  }
  async showAlert(v: string) {
    this.record('alert', v);
  }
  async setLighting(v: string) {
    this.record('lighting', v);
  }
  async setAvatar(v: string) {
    this.record('avatar', v);
  }
}
