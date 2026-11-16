// Только встроенные стрелки/круги. На скорость GIF эти параметры НЕ влияют.
export const effectDefaults = {
  scale: 1.5,         // 1 — обычный размер, 1.5 — в полтора раза крупнее
  speed: 1,         // 0.5 — вдвое медленнее, 2 — вдвое быстрее
  showRings: true,  // false — убрать центральные круги (эффект колеса остаётся)
  ringRadius: 15,   // радиус внутреннего круга
  color: null,     // null — цвет из marker-config.js; можно '#00ff88'
  offsetX: 0,      // смещение всего встроенного эффекта вправо
  offsetY: 0       // смещение вниз
};
// Здесь можно переопределить параметры отдельно для любого шага.
export const effectOverrides = {
  // throttle: { scale: 1.5, speed: 0.7, color: '#00ff88', showRings: false },
  // brake: { scale: 1.3, ringRadius: 20, color: '#ff5533' }
};
