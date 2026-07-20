export class ABLoopManager {
  /** @type {WeakMap<HTMLVideoElement, {a: number|null, b: number|null, handler: Function|null}>} */
  #map = new WeakMap();

  #getState(video) {
    if (!this.#map.has(video)) this.#map.set(video, { a: null, b: null, handler: null });
    return this.#map.get(video);
  }

  /**
   * Handle a key press for A-B looping.
   * @param {HTMLVideoElement} video
   * @param {'['|']'|'\\'} key
   * @param {Function} toastFn - callback to show a toast notification
   */
  handle(video, key, toastFn) {
    const st = this.#getState(video);
    if (key === '[') {
      st.a = video.currentTime;
      toastFn(`Loop start: ${st.a.toFixed(1)}s`, 1400);
    } else if (key === ']') {
      st.b = video.currentTime;
      toastFn(`Loop end: ${st.b.toFixed(1)}s`, 1400);
      if (st.a !== null && st.b > st.a && !st.handler) {
        st.handler = () => {
          if (st.a !== null && st.b !== null && video.currentTime >= st.b)
            video.currentTime = st.a;
        };
        video.addEventListener('timeupdate', st.handler);
      }
    } else {
      st.a = st.b = null;
      if (st.handler) video.removeEventListener('timeupdate', st.handler);
      st.handler = null;
      toastFn('Loop cleared', 1200);
    }
  }
}
