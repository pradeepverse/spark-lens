import { createRoot } from 'react-dom/client';
import '@fontsource-variable/literata/index.css';
import '@fontsource-variable/literata/wght-italic.css';
import 'katex/dist/katex.min.css';
import './styles.css';
import { Home } from './home/Home';
import { Reader } from './reader/Reader';

const root = document.getElementById('root')!;
createRoot(root).render(root.dataset.view === 'reader' ? <Reader /> : <Home />);
