import type { BrainProvider } from '../../contracts';
import { normalDecision } from '../../../packages/shared/src/index';
export class MockOpenAIProvider implements BrainProvider {
  async decide() {
    return {
      ...normalDecision(),
      say: 'Adaptador mock. El estudio usa CommentaryEngine local, sin una IA externa.',
    };
  }
}
