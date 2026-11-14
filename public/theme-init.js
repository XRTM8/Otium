(() => {
  // Keep this synchronous so the browser and native bars use the saved palette before React mounts.
  const themes = {
    paper: ['#f4ede1', true],
    parchment: ['#ede2cd', true],
    eink: ['#dfdfdf', true],
    pure: ['#f1f5f9', true],
    sakura: ['#fbf1f3', true],
    midnight: ['#06090f', false],
    amber: ['#14100c', false],
    amoled: ['#000000', false],
    forest: ['#0c1813', false],
    nordic: ['#15181e', false],
  };
  const read = key => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const validTheme = (theme, fallback) => Object.hasOwn(themes, theme) ? theme : fallback;
  const schedule = read('otium_theme_schedule');
  let theme = validTheme(read('otium_theme') ?? read('tirs_theme'), 'paper');
  if (schedule === 'system' || schedule === 'sunset') {
    const hour = new Date().getHours();
    const night = schedule === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
      : hour >= 19 || hour < 7;
    theme = night ? validTheme(read('otium_night_theme'), 'amoled') : validTheme(read('otium_day_theme'), 'paper');
  }

  const [background, light] = themes[theme];
  const scheme = light ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.add('theme-' + theme);
  root.dataset.theme = theme;
  root.style.colorScheme = scheme;
  root.style.backgroundColor = background;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  try {
    window.OtiumTheme?.setTheme?.(scheme, background, light);
  } catch (error) {
    console.debug('[Theme] Native startup theme skipped:', error);
  }
})();
