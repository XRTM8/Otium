import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo/index.css';
import { Lab } from './Lab';
import './style.css';
createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>);
