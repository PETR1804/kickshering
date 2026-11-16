export const steps = [
  { id: 'throttle', title: 'Курок газа', color: '#ffda2a', icon: 'throttle',
    description: 'Найди курок у правой рукоятки. На модели стрелка показывает, куда нажимать большим пальцем.' },
  { id: 'brake', title: 'Ручной тормоз', color: '#ff655d', icon: 'brake',
    description: 'Найди тормозной рычаг рядом с рукояткой. Чтобы плавно замедлиться, сжимай его постепенно.' },
  { id: 'handlebar', title: 'Хват руля', color: '#62bdff', icon: 'handlebar',
    description: 'Держи руль обеими руками. Стрелки показывают две рукоятки.' },
  { id: 'foot-left', title: 'Передняя нога', color: '#f99deb', icon: 'foot',
    description: 'Поставь переднюю ногу на деку ближе к рулевой стойке.' },
  { id: 'foot-right', title: 'Задняя нога', color: '#f99deb', icon: 'foot', rear: true,
    description: 'Поставь заднюю ногу на деку позади первой. Выбери устойчивое положение.' },
  { id: 'front-wheel', title: 'Переднее колесо', color: '#63e4b4', icon: 'wheel',
    description: 'Переднее колесо поворачивается вместе с рулём. Следи за направлением движения.' },
  { id: 'rear-wheel', title: 'Заднее колесо', color: '#63e4b4', icon: 'wheel',
    description: 'На модели заднее колесо отмечено зелёным. Оно следует за передним по траектории поворота.' },
  { id: 'rear-brake', title: 'Задний тормозной узел', color: '#ff655d', icon: 'rearBrake',
    description: 'Подсветка показывает тормозной узел около заднего колеса. Проверь работу тормоза перед поездкой.' }
];
