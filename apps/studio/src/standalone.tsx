import { createRoot } from 'react-dom/client';
import { ReactionDirector } from '../../../packages/core/src/index';
import { App } from './App';
import './style.css';
const session = new ReactionDirector();
createRoot(document.getElementById('root')!).render(<App session={session} />);
