import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import '@fontsource/nunito-sans/800.css';
import '@fontsource/space-mono/700.css';
import './styles/base.css';
import './styles/report.css';
import App from './App';
import {ReportProvider} from './app/state';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReportProvider>
      <App />
    </ReportProvider>
  </StrictMode>,
);
