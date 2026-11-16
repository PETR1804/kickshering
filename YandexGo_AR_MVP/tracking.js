import { AR } from './vendor/aruco/aruco.js';

export function createDetector() {
  return new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12', maxHammingDistance: 2 });
}

function solve(rows, values) {
  const size = rows[0].length;
  const system = Array.from({ length: size }, () => Array(size + 1).fill(0));
  rows.forEach((row, k) => {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) system[i][j] += row[i] * row[j];
      system[i][size] += row[i] * values[k];
    }
  });
  for (let i = 0; i < size; i++) {
    let pivot = i;
    for (let j = i + 1; j < size; j++) {
      if (Math.abs(system[j][i]) > Math.abs(system[pivot][i])) pivot = j;
    }
    [system[i], system[pivot]] = [system[pivot], system[i]];
    const divisor = system[i][i];
    if (Math.abs(divisor) < 1e-10) return null;
    system[i] = system[i].map(value => value / divisor);
    for (let j = 0; j < size; j++) {
      if (j === i) continue;
      const factor = system[j][i];
      system[j] = system[j].map((value, k) => value - factor * system[i][k]);
    }
  }
  return system.map(row => row[size]);
}

export function transformPoint([a, b, c, d, e, f, g, h], x, y) {
  const w = 1 + g * x + h * y;
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w];
}

export function detectTarget(detector, frame, layout, continuing = false) {
  const markers = new Map();
  for (const marker of detector.detect(frame)) {
    if (Object.hasOwn(layout.tags, marker.id)) {
      const previous = markers.get(marker.id);
      if (!previous || marker.hammingDistance < previous.hammingDistance) markers.set(marker.id, marker);
    }
  }
  if (markers.size < 3) {
    if (!continuing || markers.size !== 2) return null;
    // Two well-separated known tags can maintain an already acquired screen.
    const centers = [...markers.keys()].map(id => {
      const corners = layout.tags[id];
      return [(corners[0][0]+corners[2][0])/2/layout.width,
              (corners[0][1]+corners[2][1])/2/layout.height];
    });
    if (Math.hypot(centers[0][0]-centers[1][0], centers[0][1]-centers[1][1]) < .45) return null;
  }

  const matches = [];
  const rows = [];
  const values = [];
  for (const [id, marker] of markers) {
    layout.tags[id].forEach(([px, py], i) => {
      const x = px / layout.width;
      const y = py / layout.height;
      const u = marker.corners[i].x / frame.width;
      const v = marker.corners[i].y / frame.height;
      rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u], [0, 0, 0, x, y, 1, -x * v, -y * v]);
      values.push(u, v);
      matches.push({ x, y, u, v });
    });
  }
  const matrix = solve(rows, values);
  if (!matrix) return null;
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (corners.some(([x, y]) => 1 + matrix[6] * x + matrix[7] * y < .25)) return null;
  const errors = matches.map(({ x, y, u, v }) => {
    const [a, b] = transformPoint(matrix, x, y);
    return Math.hypot((a - u) * frame.width, (b - v) * frame.height);
  });
  return Math.max(...errors) < 4 ? matrix : null;
}

export function matrixForOverlay(matrix, layout, cssFrame) {
  const [a, b, c, d, e, f, g, h] = matrix;
  const { width, height, left, top } = cssFrame;
  return [
    (a * width + left * g) / layout.width, (d * height + top * g) / layout.width, 0, g / layout.width,
    (b * width + left * h) / layout.height, (e * height + top * h) / layout.height, 0, h / layout.height,
    0, 0, 1, 0, c * width + left, f * height + top, 0, 1
  ];
}
