import { metric, Confidence, now } from '../metrics.js';

export const eventStressTest = {
  id: 'event-stress',
  name: 'Event Stress Test',
  async run(ctx) {
    const { stage, forcedParams, log } = ctx;
    const perType = forcedParams?.perType ?? 2000;
    stage.innerHTML = '';
    const target = document.createElement('div');
    target.className = 'zbs-event-target';
    stage.appendChild(target);

    const types = ['click', 'pointermove', 'mousemove', 'keydown', 'scroll', 'resize'];
    const results = {};
    for (const type of types) {
      let handled = 0;
      const handler = () => { handled++; };
      const eventTarget = (type === 'resize') ? window : (type === 'scroll' ? stage : target);
      eventTarget.addEventListener(type, handler);
      const t0 = now();
      for (let i = 0; i < perType; i++) {
        let evt;
        if (type === 'click' || type === 'pointermove' || type === 'mousemove') {
          evt = new MouseEvent(type, { clientX: i % 300, clientY: i % 200, bubbles: true });
        } else if (type === 'keydown') {
          evt = new KeyboardEvent(type, { key: 'a', bubbles: true });
        } else {
          evt = new Event(type, { bubbles: true });
        }
        eventTarget.dispatchEvent(evt);
      }
      const elapsed = now() - t0;
      eventTarget.removeEventListener(type, handler);
      results[type] = {
        totalTime: metric(+elapsed.toFixed(2), 'ms', Confidence.MEASURED),
        avgPerEvent: metric(+(elapsed / perType).toFixed(4), 'ms', Confidence.MEASURED),
        handled: metric(handled, 'count', Confidence.MEASURED),
      };
    }
    log(`Event stress: ${types.length} types x ${perType} events`);
    stage.innerHTML = '';
    return { params: { perType, types }, results };
  },
};
