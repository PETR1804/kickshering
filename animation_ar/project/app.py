# app.py
# pip install flask pillow
import io
from base64 import b64encode

from flask import Flask, render_template_string
from PIL import Image


def load_frames_b64(path):
    """Перекладывает кадры анимации в base64, чтобы вставить в страницу."""
    img = Image.open(path)
    frames = []
    try:
        while True:
            buf = io.BytesIO()
            img.convert("RGBA").save(buf, format="PNG")
            frames.append(b64encode(buf.getvalue()).decode())
            img.seek(img.tell() + 1)
    except EOFError:
        pass
    if not frames:
        buf = io.BytesIO()
        Image.open(path).convert("RGBA").save(buf, format="PNG")
        frames.append(b64encode(buf.getvalue()).decode())
    return frames


PAGE = """
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Hands GIF</title>
<style>
  body { margin: 0; background: #222; display: flex; justify-content: center; padding-top: 20px; }
</style>
</head>
<body>
<video id="video" playsinline style="display:none"></video>
<canvas id="canvas" width="640" height="480"></canvas>

<script type="module">
import { FilesetResolver, HandLandmarker } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const LEFT_FRAMES = {{ left_frames | tojson }};
const RIGHT_FRAMES = {{ right_frames | tojson }};

const FRAME_TIME = 100;   // мс на кадр анимации
const PAUSE_MS = 5000;    // пауза после последнего кадра
const SIZE_PX = 200;      // размер картинки на экране

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
const landmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    delegate: "GPU"
  },
  runningMode: "VIDEO",
  numHands: 2
});

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
video.srcObject = stream;
await video.play();

const cache = {};
function getImg(frames, key, i) {
  const k = key + i;
  if (!cache[k]) {
    const im = new Image();
    im.src = "data:image/png;base64," + frames[i];
    cache[k] = im;
  }
  return cache[k];
}

// состояние анимации отдельно для каждой руки
const state = {
  Left:  { idx: 0, last: 0, pausedUntil: 0 },
  Right: { idx: 0, last: 0, pausedUntil: 0 },
};

function drawOverlay(img, cx, cy) {
  const scale = SIZE_PX / Math.max(img.width, img.height);
  ctx.drawImage(img, cx - img.width * scale / 2,
                     cy - img.height * scale / 2,
                     img.width * scale, img.height * scale);
}

function updateAnim(label, frames, now) {
  const st = state[label];
  if (st.pausedUntil) {
    if (now >= st.pausedUntil) {
      st.pausedUntil = 0;
      st.idx = 0;
      st.last = now;
    }
  } else if (now - st.last > FRAME_TIME) {
    st.idx++;
    st.last = now;
    if (st.idx >= frames.length) {
      st.idx = frames.length - 1;      // замираем на последнем кадре
      st.pausedUntil = now + PAUSE_MS; // на 5 секунд
    }
  }
  return st.idx;
}

let lastVideoTime = -1;

function loop() {
  if (video.readyState >= 2) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());

      if (result.landmarks) {
        for (let i = 0; i < result.landmarks.length; i++) {
          const lm = result.landmarks[i];
          const label = result.handedness[i][0].categoryName;

          const wrist = lm[0], middle = lm[9];
          const cx = (1 - (wrist.x + middle.x) / 2) * canvas.width;
          const cy = ((wrist.y + middle.y) / 2) * canvas.height;

          const frames = label === "Left" ? LEFT_FRAMES : RIGHT_FRAMES;
          const idx = updateAnim(label, frames, performance.now());
          drawOverlay(getImg(frames, label === "Left" ? "L" : "R", idx), cx, cy);

          ctx.fillStyle = "#0f0";
          ctx.font = "20px sans-serif";
          ctx.fillText(label.toUpperCase(), cx - 30, cy - 100);
        }
      }
    }
  }
  requestAnimationFrame(loop);
}
loop();
</script>
</body>
</html>
"""

app = Flask(__name__)
LEFT_FRAMES = load_frames_b64("1115(2)_clean.png")    # левая рука
RIGHT_FRAMES = load_frames_b64("1115(4)_clean.png")   # правая рука


@app.route("/")
def index():
    return render_template_string(PAGE,
                                  left_frames=LEFT_FRAMES,
                                  right_frames=RIGHT_FRAMES)


if __name__ == "__main__":
    app.run(debug=True)
