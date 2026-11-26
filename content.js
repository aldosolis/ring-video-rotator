// Adds a rotate button for every <video> on account.ring.com.
// Each click turns that video 90° clockwise. Sideways rotations are scaled down
// so the video stays inside its original box and the page layout doesn't shift.
//
// In Ring's live view the button goes into Ring's own control bar, next to the
// fullscreen button: the controls overlay covers the video, so a button floating
// over the video would sit underneath it. Players without that control bar get
// a button floating over the video's top-left corner instead.
(() => {
  'use strict';

  const FLOATING_CLASS = 'rvr-rotate-button';
  const DOCKED_CLASS = 'rvr-rotate-button--docked';
  const HOST_CLASS = 'rvr-host';
  // Ring's generated class names change between deploys; its test ids are stable.
  const FULLSCREEN_SELECTOR = '[data-testid$="controls__fullscreen"]';
  const MAX_PLAYER_DEPTH = 10; // ancestors to search for the video's control bar
  const MIN_VIDEO_SIZE = 120; // px; no floating button on thumbnails
  const BUTTON_INSET = 8; // px from the video's top-left corner

  /**
   * @type {Map<HTMLVideoElement, {
   *   button: HTMLButtonElement,
   *   wrapper: HTMLSpanElement | null,
   *   rotation: number,
   *   docked: boolean,
   *   resizeObserver: ResizeObserver,
   * }>}
   */
  const tracked = new Map();

  function createIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    for (const [name, value] of Object.entries({
      viewBox: '0 0 24 24',
      width: '20',
      height: '20',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    })) {
      svg.setAttribute(name, value);
    }
    const arrowHead = document.createElementNS(ns, 'polyline');
    arrowHead.setAttribute('points', '23 4 23 10 17 10');
    const arc = document.createElementNS(ns, 'path');
    arc.setAttribute('d', 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10');
    svg.append(arrowHead, arc);
    return svg;
  }

  function applyRotation(video, state) {
    if (state.rotation === 0) {
      video.style.removeProperty('transform');
      video.style.removeProperty('transform-origin');
      return;
    }
    // offsetWidth/Height ignore transforms, so this is the unrotated box.
    // Turned sideways, a w×h box needs h×w of room, so shrink it to fit back in w×h.
    const w = video.offsetWidth;
    const h = video.offsetHeight;
    const sideways = state.rotation % 180 !== 0;
    const scale = sideways && w > 0 && h > 0 ? Math.min(w / h, h / w) : 1;
    video.style.setProperty('transform', `rotate(${state.rotation}deg) scale(${scale})`, 'important');
    video.style.setProperty('transform-origin', 'center center', 'important');
  }

  function updateLabel(state) {
    const label =
      state.rotation === 0
        ? 'Rotate video 90° clockwise'
        : `Rotate video 90° clockwise (currently ${state.rotation}°)`;
    state.button.title = label;
    state.button.setAttribute('aria-label', label);
  }

  function rotate(video) {
    const state = tracked.get(video);
    if (!state) return;
    state.rotation = (state.rotation + 90) % 360;
    applyRotation(video, state);
    updateLabel(state);
  }

  // Finds the fullscreen button of the player holding this video, without
  // climbing into a container that also holds another camera's player.
  function findFullscreenButton(video) {
    let el = video.parentElement;
    for (let depth = 0; el && el !== document.body && depth < MAX_PLAYER_DEPTH; depth++) {
      if (el.querySelectorAll('video').length > 1) return null;
      const fullscreen = el.querySelector(FULLSCREEN_SELECTOR);
      if (fullscreen) return fullscreen;
      el = el.parentElement;
    }
    return null;
  }

  // Puts the button just before Ring's fullscreen button, borrowing its classes
  // so it gets Ring's look. Ring wraps each control in a tooltip <span>, so the
  // button gets a matching wrapper to keep the spacing consistent.
  function dock(video, state, fullscreen) {
    const { button } = state;
    const className = `${fullscreen.className} ${DOCKED_CLASS}`;
    if (button.className !== className) button.className = className;
    button.hidden = false;
    button.style.removeProperty('top');
    button.style.removeProperty('left');

    const tooltip = fullscreen.parentElement?.tagName === 'SPAN' ? fullscreen.parentElement : null;
    let node = button;
    if (tooltip) {
      state.wrapper ??= document.createElement('span');
      if (state.wrapper.className !== tooltip.className) state.wrapper.className = tooltip.className;
      if (button.parentElement !== state.wrapper) state.wrapper.append(button);
      node = state.wrapper;
    } else {
      state.wrapper?.remove();
    }
    const anchor = tooltip ?? fullscreen;
    if (node.nextSibling !== anchor) anchor.before(node);

    if (!state.docked) {
      state.docked = true;
      state.resizeObserver.disconnect();
      state.resizeObserver.observe(video);
    }
  }

  function positionFloating(video, state) {
    const { button } = state;
    button.hidden = video.offsetWidth < MIN_VIDEO_SIZE || video.offsetHeight < MIN_VIDEO_SIZE;
    button.style.setProperty('top', `${video.offsetTop + BUTTON_INSET}px`, 'important');
    button.style.setProperty('left', `${video.offsetLeft + BUTTON_INSET}px`, 'important');
  }

  // The floating button lives next to the video so it scrolls with it.
  function float(video, state) {
    const parent = video.parentElement;
    if (!parent) return;
    const { button } = state;
    if (button.className !== FLOATING_CLASS) button.className = FLOATING_CLASS;
    if (button.parentElement === parent) return;
    if (getComputedStyle(parent).position === 'static') {
      parent.classList.add(HOST_CLASS);
    }
    parent.append(button);
    positionFloating(video, state);
    state.resizeObserver.disconnect();
    state.resizeObserver.observe(video);
    state.resizeObserver.observe(parent);
  }

  function place(video, state) {
    const fullscreen = findFullscreenButton(video);
    if (fullscreen) {
      dock(video, state, fullscreen);
    } else if (!state.docked) {
      float(video, state);
    }
    // A docked button whose control bar is gone (Ring unmounted the controls)
    // stays out until the controls come back, rather than floating underneath them.
  }

  function attach(video) {
    const button = document.createElement('button');
    button.type = 'button';
    button.append(createIcon());

    // Keep presses on the button from reaching Ring's player
    // (click-to-pause, double-click-to-fullscreen, show/hide controls).
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) {
      button.addEventListener(type, (event) => event.stopPropagation());
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      rotate(video);
    });

    const state = { button, wrapper: null, rotation: 0, docked: false, resizeObserver: null };
    state.resizeObserver = new ResizeObserver(() => {
      applyRotation(video, state);
      if (!state.docked) positionFloating(video, state);
    });
    tracked.set(video, state);
    updateLabel(state);
    place(video, state);
  }

  function detach(video) {
    const state = tracked.get(video);
    if (!state) return;
    state.resizeObserver.disconnect();
    state.button.remove();
    state.wrapper?.remove();
    tracked.delete(video);
  }

  function scan() {
    for (const video of tracked.keys()) {
      if (!video.isConnected) detach(video);
    }
    for (const video of document.querySelectorAll('video')) {
      const state = tracked.get(video);
      // Re-placing also restores the button after Ring re-renders its controls.
      if (state) place(video, state);
      else attach(video);
    }
  }

  // Ring is a single-page app, so videos come and go without page loads.
  // MutationObserver already batches changes into one callback per task.
  new MutationObserver(scan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scan();
})();
