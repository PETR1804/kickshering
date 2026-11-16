import { createMediaEffect } from './media-effect.js';
import { steps } from './marker-config.js';
import { paintEffect } from './effects.js';

const element = id => document.getElementById(id);
const view = Object.fromEntries([
  'welcome', 'scan', 'lesson', 'complete', 'cameraStage', 'demoStage', 'demoAnimation',
  'trackingStatus', 'focusFrame', 'openCamera', 'openDemo', 'cameraError', 'scanTitle',
  'scanCopy', 'startLesson', 'cancelCamera', 'stepTitle', 'stepDescription', 'stepCount',
  'progress', 'back', 'next', 'restart'
].map(id => [id, element(id)]));

const demoMedia = createMediaEffect(element('demoTarget'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const progress = steps.map(() => view.progress.appendChild(document.createElement('span')));
const context = view.demoAnimation.getContext('2d');
let state = 'welcome';
let mode = 'camera';
let tracked = false;
let index = 0;
let active = null;
let session = null;
let layout = null;
let demoFrame;
let demoLastPaint = -Infinity;

async function loadLayout() {
  if (!layout) {
    const response = await fetch('./target-layout.json');
    if (!response.ok) throw new Error('Не удалось загрузить координаты мишени. Обнови страницу.');
    const data = await response.json();
    if (!data.tags || !steps.every(step => Array.isArray(data.anchors?.[step.id]))) {
      throw new Error('В файле мишени отсутствуют координаты одного из шагов.');
    }
    layout = data;
  }
  return layout;
}

function syncUI() {
  const scanning = state === 'loading' || state === 'scan';
  const playing = state === 'lesson';
  view.welcome.hidden = state !== 'welcome';
  view.scan.hidden = !scanning;
  view.lesson.hidden = !playing;
  view.complete.hidden = state !== 'complete';
  view.focusFrame.hidden = mode === 'demo' || tracked || (state !== 'scan' && !playing);
  view.trackingStatus.hidden = !playing && !scanning;
  view.trackingStatus.dataset.tracked = mode === 'camera' && tracked ? 'true' : 'false';
  view.trackingStatus.textContent = mode === 'demo' ? 'Режим без камеры'
    : state === 'loading' ? 'Камера запускается'
    : tracked ? 'Самокат в кадре'
    : playing ? 'Верни самокат в кадр' : 'Поиск самоката';
  view.startLesson.hidden = state !== 'scan' || !tracked;
  view.cancelCamera.hidden = !scanning || mode !== 'camera';
  view.scanTitle.textContent = state === 'loading' ? 'Запускаем камеру'
    : tracked ? 'Самокат найден' : 'Наведи камеру на самокат';
  view.scanCopy.textContent = state === 'loading' ? 'Если браузер спросит, разреши доступ к камере.'
    : tracked ? 'Держи самокат в кадре и начинай обучение.'
    : (new URLSearchParams(location.search).has('live') ? 'Открой live.html на ноутбуке через python server.py. Держи в кадре минимум три угловые метки; дождись соединения.' : 'Помести в кадр самокат вместе с метками по углам изображения.');
  view.next.disabled = !tracked;
  view.back.disabled = index === 0;
}

function errorMessage(error) {
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError': return 'Браузер не дал доступ к камере. Разреши её в настройках сайта и попробуй снова.';
    case 'NotFoundError':
    case 'OverconstrainedError': return 'Камера недоступна. Проверь её подключение или пройди урок без камеры.';
    case 'NotReadableError': return 'Камера занята или недоступна. Закрой приложение, которое её использует, и попробуй снова.';
    case 'TimeoutError': return 'Мишень загружается слишком долго. Проверь подключение и попробуй снова.';
    default: return error.message || 'Не удалось запустить AR. Попробуй снова или пройди урок без камеры.';
  }
}

function stopCamera() {
  const previous = session;
  session = null;
  previous?.abort();
}

function returnToWelcome(error) {
  stopCamera();
  stopDemo();
  tracked = false;
  active = null;
  mode = 'camera';
  state = 'welcome';
  view.cameraError.hidden = !error;
  view.cameraError.textContent = error ? errorMessage(error) : '';
  syncUI();
}

function captureGetStream() {
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Для камеры открой страницу по HTTPS в браузере. На компьютере также можно использовать localhost.');
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
}

async function openCamera() {
  if (state === 'loading') return;
  stopDemo();
  stopCamera();
  mode = 'camera';
  tracked = false;
  active = null;
  state = 'loading';
  syncUI();
  const current = new AbortController();
  session = current;
  let stream;
  try {
    // Request permission directly from the click, before loading the AR modules.
    const streamPromise = captureGetStream().then(result => {
      if (current.signal.aborted) {
        result.getTracks().forEach(track => track.stop());
        current.signal.throwIfAborted();
      }
      stream = result;
      return stream;
    });
    const [media, targetLayout, { startCamera }] = await Promise.all([streamPromise, loadLayout(), import('./camera.js')]);
    current.signal.throwIfAborted();
    await startCamera({
      stream: media,
      container: view.cameraStage,
      signal: current.signal,
      layout: targetLayout,
      getEffect: () => active,
      onTracking(found) {
        if (session !== current) return;
        tracked = found;
        syncUI();
      },
      onError(error) {
        if (session === current) returnToWelcome(error);
      }
    });
    if (session === current) {
      state = 'scan';
      syncUI();
    }
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    if (session === current) returnToWelcome(error);
  }
}

function stopDemo() {
  cancelAnimationFrame(demoFrame);
  demoMedia.update(null, false);
  view.demoStage.hidden = true;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  demoLastPaint = -Infinity;
}

async function openDemo() {
  stopCamera();
  stopDemo();
  view.openDemo.disabled = true;
  view.openCamera.disabled = true;
  try {
    await loadLayout();
    mode = 'demo';
    tracked = true;
    context.canvas.width = layout.width;
    context.canvas.height = layout.height;
    view.demoStage.hidden = false;
    showStep(0);
    const render = now => {
      if (now - demoLastPaint >= 33) {
        const scale=element('demoTarget').clientWidth/1120;
        const custom=demoMedia.update(active, true, `scale(${scale})`);
        if(custom) context.clearRect(0,0,context.canvas.width,context.canvas.height);
        else paintEffect(context, active, active?.seconds(now));
        demoLastPaint = now;
      }
      demoFrame = requestAnimationFrame(render);
    };
    demoFrame = requestAnimationFrame(render);
  } catch (error) {
    returnToWelcome(error);
  } finally {
    view.openDemo.disabled = false;
    view.openCamera.disabled = false;
  }
}

function showStep(stepIndex) {
  index = stepIndex;
  state = 'lesson';
  const step = steps[index];
  active = {
    step,
    layout: layout.anchors,
    since: performance.now(),
    seconds(now) {
      return reducedMotion.matches ? .35 : Math.max(0, now - this.since) / 1000;
    }
  };
  view.stepTitle.textContent = step.title;
  view.stepDescription.textContent = step.description;
  view.stepCount.textContent = `Шаг ${index + 1} из ${steps.length}`;
  view.next.textContent = index === steps.length - 1 ? 'Завершить' : 'Далее';
  progress.forEach((segment, i) => segment.classList.toggle('done', i <= index));
  syncUI();
}

function finish() {
  active = null;
  state = 'complete';
  stopCamera();
  stopDemo();
  tracked = false;
  syncUI();
  view.restart.focus();
}

view.openCamera.addEventListener('click', openCamera);
view.openDemo.addEventListener('click', openDemo);
view.cancelCamera.addEventListener('click', () => returnToWelcome());
view.startLesson.addEventListener('click', () => {
  if (state === 'scan' && tracked) {
    showStep(0);
    view.next.focus();
  }
});
view.back.addEventListener('click', () => {
  if (state === 'lesson' && index > 0) showStep(index - 1);
});
view.next.addEventListener('click', () => {
  if (state !== 'lesson' || !tracked) return;
  if (index < steps.length - 1) showStep(index + 1);
  else finish();
});
view.restart.addEventListener('click', () => mode === 'demo' ? openDemo() : openCamera());
window.addEventListener('pagehide', () => {
  if (session) returnToWelcome();
});
syncUI();
if (new URLSearchParams(location.search).has('live')) {
  view.welcome.querySelector('p').textContent='На ноутбуке открой live.html. Наведи камеру на 3D-модель и угловые метки.';
  view.openDemo.hidden=true;
}
if (new URLSearchParams(location.search).has('demo')) openDemo();
