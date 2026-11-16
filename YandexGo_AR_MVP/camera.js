import { trackingOptions } from './tracking-config.js';
import { startLiveSync } from './live-sync.js';
import { createMediaEffect } from './media-effect.js';
import { paintEffect } from './effects.js';
import { createDetector, detectTarget, matrixForOverlay } from './tracking.js';

function waitForVideo(video, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const local = new AbortController();
    const finish = error => {
      local.abort();
      clearTimeout(timer);
      signal.removeEventListener('abort', cancelled);
      if (error) reject(error);
      else resolve();
    };
    const cancelled = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error('Камера не передала изображение. Попробуй открыть её снова.')), 12000);
    signal.addEventListener('abort', cancelled, { once: true });
    video.addEventListener('loadeddata', () => finish(), { signal: local.signal });
    video.addEventListener('error', () => finish(new Error('Не удалось прочитать изображение камеры.')), { signal: local.signal });
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
  });
}

export async function startCamera({ stream, container, signal, layout, onTracking, onError, getEffect }) {
  const video = document.createElement('video');
  video.className = 'camera-feed';
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  const overlay = document.createElement('canvas');
  overlay.className = 'camera-overlay';
  overlay.width = Math.round(layout.width * .75);
  overlay.height = Math.round(layout.height * .75);
  overlay.style.width = layout.width + 'px';
  overlay.style.height = layout.height + 'px';
  overlay.hidden = true;
  const overlayContext = overlay.getContext('2d');
  container.append(video, overlay);

  const mediaEffect = createMediaEffect(container);
  const live = new URLSearchParams(location.search).has('live');
  const getLive = live ? startLiveSync(signal) : () => null;
  let frameRequest;
  const dispose = () => {
    cancelAnimationFrame(frameRequest);
    signal.removeEventListener('abort', dispose);
    stream.getTracks().forEach(track => track.stop());
    video.pause();
    video.srcObject = null;
    video.remove();
    overlay.remove();
    mediaEffect.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });

  try {
    signal.throwIfAborted();
    video.srcObject = stream;
    await Promise.all([waitForVideo(video, signal), video.play()]);
    signal.throwIfAborted();
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (!signal.aborted) onError(new Error('Доступ к камере прерван. Открой её снова.'));
      }, { once: true, signal });
    }

    const detector = createDetector();
    const frame = document.createElement('canvas');
    const frameContext = frame.getContext('2d', { willReadFrequently: true });
    let seen = 0;
    let lastSeen = -Infinity;
    let lastDetection = -Infinity;
    let lastPaint = -Infinity;
    let lastEffect = null;
    let pose = null;
    let tracked = false;

    const render = now => {
      if (signal.aborted) return;
      if (now - lastDetection >= trackingOptions.detectionIntervalMs && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        lastDetection = now;
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        if (frame.width !== width || frame.height !== height) {
          frame.width = width;
          frame.height = height;
          pose = null;
          seen = 0;
          lastSeen = -Infinity;
        }
        frameContext.drawImage(video, 0, 0, width, height);
        const detection = detectTarget(detector, frameContext.getImageData(0, 0, width, height), layout, tracked);
        if (detection) {
          pose = pose ? detection.map((value, i) => .65 * value + .35 * pose[i]) : detection;
          lastSeen = now;
          seen++;
        } else {
          seen = 0;
          if (now - lastSeen >= trackingOptions.holdMs) pose = null;
        }
        const found = Boolean(pose && (tracked || seen >= 2) && (!live || getLive()));
        if (found !== tracked) {
          tracked = found;
          onTracking(found);
        }
      }

      const effect = getEffect();
      const points = live ? getLive() : null;
      const active = effect && (!live || points) ? {...effect, layout: points || effect.layout} : null;
      if (!active || !tracked) mediaEffect.update(active || effect, false);
      overlay.hidden = !active || !tracked;
      if (!overlay.hidden) {
        const viewport = video.getBoundingClientRect();
        const host = container.getBoundingClientRect();
        const fit = Math.min(viewport.width / video.videoWidth, viewport.height / video.videoHeight);
        const width = video.videoWidth * fit;
        const height = video.videoHeight * fit;
        const left = viewport.left - host.left + (viewport.width - width) / 2;
        const top = viewport.top - host.top + (viewport.height - height) / 2;
        overlay.style.transform = 'matrix3d(' + matrixForOverlay(pose, layout, { width, height, left, top }).join(',') + ')';
        if (effect !== lastEffect || now - lastPaint >= 33) {
          const custom = mediaEffect.update(active, true, overlay.style.transform);
          if (custom) overlayContext.clearRect(0,0,overlay.width,overlay.height);
          else paintEffect(overlayContext, active, active.seconds(now));
          lastEffect = effect;
          lastPaint = now;
        }
      }
      frameRequest = requestAnimationFrame(render);
    };
    frameRequest = requestAnimationFrame(render);
  } catch (error) {
    dispose();
    throw error;
  }
}
