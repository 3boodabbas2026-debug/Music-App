import type { ThemeScheme } from './theme';

// Web uses live CSS variables. Node-based utility tests have no document and
// intentionally fall back to the deterministic dark literals.
export const supportsCssVariables = typeof document !== 'undefined';
export const initialThemeScheme: ThemeScheme = 'dark';
