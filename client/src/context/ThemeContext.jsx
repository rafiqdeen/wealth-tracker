import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored || 'light';
  });

  const [contrastMode, setContrastMode] = useState(() => {
    const stored = localStorage.getItem('contrastMode');
    return stored || 'calm'; // 'calm' (muted) or 'high' (vivid)
  });

  useEffect(() => {
    const root = document.documentElement;
    // Apply dark mode
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    // Apply contrast mode
    if (contrastMode === 'high') {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    localStorage.setItem('contrastMode', contrastMode);
  }, [contrastMode]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleContrastMode = () => {
    setContrastMode(prev => prev === 'calm' ? 'high' : 'calm');
  };

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === 'dark',
    contrastMode,
    setContrastMode,
    toggleContrastMode,
    isHighContrast: contrastMode === 'high',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
