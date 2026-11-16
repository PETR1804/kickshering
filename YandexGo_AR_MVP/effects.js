import { effectDefaults, effectOverrides } from './effect-config.js';
function stroke(ctx, points, width) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.lineWidth = width;
  ctx.stroke();
}

function arrow(ctx, start, end, width = 4) {
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const wings = [-.64, .64].map(offset => [
    end[0] - 14 * Math.cos(angle + offset), end[1] - 14 * Math.sin(angle + offset)
  ]);
  stroke(ctx, [start, end], width);
  stroke(ctx, [wings[0], end, wings[1]], width);
}

function ring(ctx, radius, start = 0, end = 2 * Math.PI, width = 3) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, start, end);
  ctx.lineWidth = width;
  ctx.stroke();
}

function foot(ctx, phase, rear) {
  ctx.save();
  ctx.translate(4, -7 - phase * 19);
  ctx.rotate(rear ? .32 : -.38);
  ctx.beginPath();
  ctx.ellipse(0, -11, 8, 13, -.11, 0, 2 * Math.PI);
  ctx.ellipse(1, 8, 5, 7, .15, 0, 2 * Math.PI);
  ctx.fill();
  for (let toe = 0; toe < 4; toe++) {
    ctx.beginPath();
    ctx.arc(-6 + toe * 4, -26 + Math.abs(1 - toe) * 1.6, 2.3, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

export function paintEffect(ctx, active, seconds) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!active) return;

  const { step, layout } = active;
  const settings = { ...effectDefaults, ...effectOverrides[step.id] };
  const scale = Number.isFinite(settings.scale) && settings.scale > 0 ? settings.scale : 1;
  seconds *= Number.isFinite(settings.speed) && settings.speed >= 0 ? settings.speed : 1;
  const phase = (1 - Math.cos(seconds * Math.PI * 1.45)) / 2;
  const point = layout[step.id];
  ctx.save();
  ctx.scale(width / 1120, height / 1000);
  ctx.translate(560 + point[0] * 1120, 500 - point[1] * 1120);
  ctx.translate(settings.offsetX || 0, settings.offsetY || 0);
  ctx.scale(scale, scale);
  ctx.strokeStyle = settings.color || step.color;
  ctx.fillStyle = settings.color || step.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#14151d';
  ctx.shadowBlur = 12;

  if (settings.showRings) {
  ctx.save();
  ctx.globalAlpha = .4 - phase * .24;
  ring(ctx, settings.ringRadius + 7 + phase * 14);
  ctx.restore();
  ring(ctx, settings.ringRadius, 0, 2 * Math.PI, 3.5);
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, 2 * Math.PI);
  ctx.fill();
  }

  switch (step.icon) {
    case 'throttle': {
      const shift = phase * 12;
      arrow(ctx, [36, -52 + shift], [19, -16 + shift]);
      break;
    }
    case 'brake': {
      const shift = phase * 11;
      arrow(ctx, [-61 + shift, 17], [-22 + shift, 4]);
      stroke(ctx, [[-52 + shift, 30], [-40 + shift, 26]], 3);
      break;
    }
    case 'handlebar': {
      for (const grip of [layout.leftGrip, layout.rightGrip]) {
        const x = (grip[0] - point[0]) * 1120 / scale;
        const y = (point[1] - grip[1]) * 1120 / scale;
        const shift = phase * 10;
        arrow(ctx, [x, y - 56 + shift], [x, y - 11 + shift]);
      }
      break;
    }
    case 'foot':
      foot(ctx, phase, step.rear);
      break;
    case 'wheel': {
      const angle = (seconds * 2.1) % (2 * Math.PI);
      ring(ctx, 35, angle, angle + 4.6, 4);
      const x = 35 * Math.cos(angle + 4.6);
      const y = 35 * Math.sin(angle + 4.6);
      arrow(ctx, [x + 8 * Math.sin(angle + 4.6), y - 8 * Math.cos(angle + 4.6)], [x, y], 3.5);
      break;
    }
    case 'rearBrake': {
      const shift = 8 * phase;
      arrow(ctx, [62 - shift, 4], [22 - shift, 1]);
      stroke(ctx, [[-14 - shift, 25], [-5 - shift, 33]], 3);
      stroke(ctx, [[8 + shift, 27], [1 + shift, 35]], 3);
      break;
    }
  }
  ctx.restore();
}
