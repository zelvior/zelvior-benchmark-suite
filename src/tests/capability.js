import { metric, Confidence } from '../metrics.js';

function gpuInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { return null; }
}

async function refreshRateEstimate() {
  return new Promise((resolve) => {
    let frames = 0; const start = performance.now();
    function tick(t) {
      frames++;
      if (t - start < 500) requestAnimationFrame(tick);
      else resolve(Math.round((frames / (t - start)) * 1000));
    }
    requestAnimationFrame(tick);
  });
}

export const browserCapabilityTest = {
  id: 'browser-capability',
  name: 'Browser Capability Test',
  async run() {
    const ua = navigator.userAgent;
    const refreshRate = await refreshRateEstimate();
    const c = document.createElement('canvas');
    const results = {
      userAgent: metric(ua, 'string', Confidence.MEASURED),
      platform: metric(navigator.platform || 'unknown', 'string', Confidence.MEASURED),
      cpuCores: metric(navigator.hardwareConcurrency || null, 'cores',
        navigator.hardwareConcurrency ? Confidence.MEASURED : Confidence.INFERRED),
      ramEstimateGB: metric(navigator.deviceMemory || null, 'GB',
        navigator.deviceMemory ? Confidence.ESTIMATED : Confidence.INFERRED, 'navigator.deviceMemory is bucketed, not exact'),
      gpuRenderer: metric(gpuInfo(), 'string', Confidence.ESTIMATED, 'via WEBGL_debug_renderer_info, may be masked'),
      screenResolution: metric(`${screen.width}x${screen.height}`, 'px', Confidence.MEASURED),
      devicePixelRatio: metric(window.devicePixelRatio, 'ratio', Confidence.MEASURED),
      refreshRateEstimate: metric(refreshRate, 'Hz', Confidence.ESTIMATED, 'measured via rAF sampling over 500ms'),
      touchSupport: metric('ontouchstart' in window || navigator.maxTouchPoints > 0, 'bool', Confidence.MEASURED),
      webgl: metric(!!c.getContext('webgl'), 'bool', Confidence.MEASURED),
      webgl2: metric(!!c.getContext('webgl2'), 'bool', Confidence.MEASURED),
      webgpu: metric(!!navigator.gpu, 'bool', Confidence.MEASURED),
      webassembly: metric(typeof WebAssembly !== 'undefined', 'bool', Confidence.MEASURED),
      simd: metric(typeof WebAssembly !== 'undefined' && typeof WebAssembly.validate === 'function', 'bool', Confidence.INFERRED, 'presence check only, not a real SIMD execution test'),
      offscreenCanvas: metric(typeof OffscreenCanvas !== 'undefined', 'bool', Confidence.MEASURED),
      serviceWorker: metric('serviceWorker' in navigator, 'bool', Confidence.MEASURED),
      indexedDB: metric('indexedDB' in window, 'bool', Confidence.MEASURED),
      sharedArrayBuffer: metric(typeof SharedArrayBuffer !== 'undefined', 'bool', Confidence.MEASURED),
    };
    return { params: {}, results };
  },
};
