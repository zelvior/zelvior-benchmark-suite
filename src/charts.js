// Lightweight canvas line-chart renderer. No external chart libraries.

export class LiveChart {
  constructor(canvas, { color = '#5CF2A0', maxPoints = 300, min = 0, max = 100, label = '' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = color;
    this.maxPoints = maxPoints;
    this.min = min;
    this.max = max;
    this.label = label;
    this.data = [];
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }
  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width; this._h = rect.height;
    this.draw();
  }
  push(value) {
    this.data.push(value);
    if (this.data.length > this.maxPoints) this.data.shift();
    if (value > this.max) this.max = value * 1.1;
    this.draw();
  }
  draw() {
    const { ctx, _w: w, _h: h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (this.data.length < 2) return;
    const range = this.max - this.min || 1;
    ctx.beginPath();
    this.data.forEach((v, i) => {
      const x = (i / (this.maxPoints - 1)) * w;
      const y = h - ((v - this.min) / range) * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, this.color + '33');
    grad.addColorStop(1, this.color + '00');
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

export function drawBarChart(canvas, entries, { color = '#5CF2A0' } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...entries.map(e => e.value), 1);
  const barW = w / entries.length;
  entries.forEach((e, i) => {
    const bh = (e.value / max) * (h - 24);
    ctx.fillStyle = color;
    ctx.fillRect(i * barW + 4, h - bh - 18, barW - 8, bh);
    ctx.fillStyle = '#9db8ab';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(e.label), i * barW + barW / 2, h - 4);
  });
}
