export function createGameInput(
  onToggle,
  touchControls,
  onTrick,
  isEnabled = () => true,
) {
  const pressedKeys = new Set();
  const activeTouchPointers = new Map();
  const directionByKey = new Map([
    ['ArrowLeft', 'left'],
    ['KeyA', 'left'],
    ['KeyQ', 'left'],
    ['ArrowRight', 'right'],
    ['KeyD', 'right'],
    ['ArrowUp', 'up'],
    ['KeyW', 'up'],
    ['KeyZ', 'up'],
    ['ArrowDown', 'down'],
    ['KeyS', 'down'],
  ]);
  const trickByKey = new Map([
    ['Digit1', 'air'],
    ['Digit2', 'rotation360'],
    ['Digit3', 'cutback'],
  ]);
  const listeners = [];

  function addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    listeners.push(() => target.removeEventListener(type, listener, options));
  }

  function handleKeydown(event) {
    if (!isEnabled()) return;

    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      onToggle();
      return;
    }

    const trick = trickByKey.get(event.code);
    if (trick && !event.repeat) {
      event.preventDefault();
      onTrick(trick);
      return;
    }

    const direction = directionByKey.get(event.code);
    if (!direction) return;

    event.preventDefault();
    pressedKeys.add(direction);
  }

  function handleKeyup(event) {
    const direction = directionByKey.get(event.code);
    if (direction) pressedKeys.delete(direction);
  }

  addListener(window, 'keydown', handleKeydown);
  addListener(window, 'keyup', handleKeyup);
  addListener(window, 'blur', () => {
    pressedKeys.clear();
    activeTouchPointers.clear();
  });

  addListener(window, 'pointerup', (event) => {
    activeTouchPointers.delete(event.pointerId);
  });
  addListener(window, 'pointercancel', (event) => {
    activeTouchPointers.delete(event.pointerId);
  });

  for (const button of touchControls.querySelectorAll('[data-direction]')) {
    const direction = button.dataset.direction;
    if (!direction) continue;

    addListener(button, 'pointerdown', (event) => {
      if (!isEnabled()) return;
      event.preventDefault();
      activeTouchPointers.set(event.pointerId, direction);
    });
  }

  for (const button of document.querySelectorAll('[data-trick]')) {
    const trick = button.dataset.trick;
    if (!trick) continue;

    addListener(button, 'click', () => onTrick(trick));
  }

  return {
    getMovement() {
      function isPressed(direction) {
        if (!isEnabled()) return false;
        if (pressedKeys.has(direction)) return true;
        for (const activeDirection of activeTouchPointers.values()) {
          if (activeDirection === direction) return true;
        }
        return false;
      }

      return {
        turn: Number(isPressed('right')) - Number(isPressed('left')),
        forward: Number(isPressed('up')) - Number(isPressed('down')),
      };
    },
    dispose() {
      for (const removeListener of listeners) removeListener();
      pressedKeys.clear();
      activeTouchPointers.clear();
    },
  };
}