interface LoopState {
  a: number | null;
  b: number | null;
  handler: (() => void) | null;
}

export class ABLoopManager {
  #map = new WeakMap<HTMLVideoElement, LoopState>();

  #getState(video: HTMLVideoElement): LoopState {
    let st = this.#map.get(video);
    if (!st) {
      st = { a: null, b: null, handler: null };
      this.#map.set(video, st);
    }
    return st;
  }

  /** Handle a key press for A-B looping. */
  handle(video: HTMLVideoElement, key: '[' | ']' | '\\', toastFn: (msg: string, ms: number) => void) {
    const st = this.#getState(video);
    if (key === '[') {
      st.a = video.currentTime;
      toastFn(`Loop start: ${st.a.toFixed(1)}s`, 1400);
    } else if (key === ']') {
      st.b = video.currentTime;
      toastFn(`Loop end: ${st.b.toFixed(1)}s`, 1400);
      if (st.a !== null && st.b > st.a && !st.handler) {
        st.handler = () => {
          if (st.a !== null && st.b !== null && video.currentTime >= st.b) video.currentTime = st.a;
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
