import { trackingOptions } from './tracking-config.js';
import { steps } from './marker-config.js';
export function startLiveSync(signal) {
  const room = new URLSearchParams(location.search).get('room') || 'demo';
  let latest = null, received = -Infinity;
  async function poll() {
    while (!signal.aborted) {
      try {
        const r = await fetch('/api/pose?room='+encodeURIComponent(room), {cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(2000)])});
        if (!r.ok) throw new Error('Server');
        const data = await r.json();
        const required=[...steps.map(s=>s.id),'leftGrip','rightGrip'];
        const valid=data.ready && required.every(id=>Array.isArray(data.anchors?.[id]) && data.anchors[id].length===2 && data.anchors[id].every(Number.isFinite));
        latest = valid ? data.anchors : null;
        if (valid) received = performance.now();
      } catch { /* Keep the last valid sample only until networkHoldMs expires. */ }
      if (!signal.aborted) await new Promise(resolve => setTimeout(resolve,100));
    }
  }
  poll();
  return () => performance.now()-received < trackingOptions.networkHoldMs ? latest : null;
}
