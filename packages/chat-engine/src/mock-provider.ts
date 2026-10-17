import type { ChatProvider } from '../../../integrations/contracts';
import type { ChatMessage } from '../../shared/src/index';
export class MockChatProvider implements ChatProvider {
  connected = false;
  inbox: ChatMessage[] = [];
  outbox: string[] = [];
  async connect() {
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  async *getMessages() {
    if (!this.connected) throw new Error('Proveedor desconectado');
    while (this.inbox.length) yield this.inbox.shift()!;
  }
  async sendMessage(message: string) {
    if (!this.connected) throw new Error('Proveedor desconectado');
    this.outbox.push(message);
  }
}
