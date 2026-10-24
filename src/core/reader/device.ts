// High-Performance Device, Screen & Refresh Rate (Hz) Engine

// Live refresh rate detector using requestAnimationFrame timestamp deltas
let cachedRefreshRate: number = 60;
let hasMeasuredRefreshRate = false;

export function measureRefreshRate(callback?: (hz: number) => void): void {
  if (typeof window === 'undefined' || hasMeasuredRefreshRate) {
    if (callback) callback(cachedRefreshRate);
    return;
  }

  const frameTimes: number[] = [];
  let count = 0;
  const maxSamples = 25;
  let lastTime = performance.now();

  function sample(now: number) {
    const delta = now - lastTime;
    lastTime = now;
    if (delta > 0 && delta < 100) {
      frameTimes.push(delta);
    }

    count++;
    if (count < maxSamples) {
      requestAnimationFrame(sample);
    } else {
      // Calculate median frame time to avoid outliers
      frameTimes.sort((a, b) => a - b);
      const medianDelta = frameTimes[Math.floor(frameTimes.length / 2)];
      if (medianDelta > 0) {
        const rawHz = 1000 / medianDelta;
        // Snap to common standard display refresh rates
        let hz = 60;
        if (rawHz >= 210) hz = 240;
        else if (rawHz >= 155) hz = 165;
        else if (rawHz >= 135) hz = 144;
        else if (rawHz >= 110) hz = 120;
        else if (rawHz >= 80) hz = 90;
        else if (rawHz >= 70) hz = 75;
        else hz = 60;

        cachedRefreshRate = hz;
        hasMeasuredRefreshRate = true;
        if (callback) callback(hz);
      }
    }
  }

  requestAnimationFrame(sample);
}

// Compute the optimal razor-sharp scale for a PDF page given container size and view mode
export function computeOptimalPageScale(
  pageWidth: number,
  pageHeight: number,
  containerWidth: number,
  containerHeight: number,
  mode: 'continuous' | 'single' | 'dual'
): number {
  if (!pageWidth || !containerWidth) return 1.15;

  const paddingH = containerWidth < 640 ? 16 : 48;
  const paddingV = 80;

  const availW = Math.max(320, containerWidth - paddingH);
  const availH = Math.max(400, containerHeight - paddingV);

  if (mode === 'dual') {
    // Two pages side by side: each page gets half the available horizontal space
    const targetW = (availW - 32) / 2;
    const scaleByW = targetW / pageWidth;
    const scaleByH = availH / pageHeight;
    // Fit so both pages fit within height and width without vertical/horizontal overflow
    return Math.max(0.4, Math.min(1.8, Number(Math.min(scaleByW, scaleByH).toFixed(2))));
  }

  if (mode === 'single') {
    // Single page presentation: fit cleanly inside the screen viewport
    const scaleByW = (availW - 16) / pageWidth;
    const scaleByH = (availH - 20) / pageHeight;
    return Math.max(0.5, Math.min(2.2, Number(Math.min(scaleByW, scaleByH).toFixed(2))));
  }

  // Continuous vertical scroll: comfortable reading width
  if (containerWidth < 640) {
    return Math.max(0.4, Math.min(1.2, Number((availW / pageWidth).toFixed(2))));
  } else if (containerWidth < 1200) {
    const targetW = Math.min(availW, 850);
    return Math.max(0.6, Math.min(1.6, Number((targetW / pageWidth).toFixed(2))));
  } else {
    // Large screens: optimal 850-950px column width for text legibility
    const targetW = Math.min(availW * 0.75, 960);
    return Math.max(0.8, Math.min(1.8, Number((targetW / pageWidth).toFixed(2))));
  }
}
