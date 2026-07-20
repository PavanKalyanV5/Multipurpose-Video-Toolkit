import { formatTime } from './constants.js';

export class VideoRecorder {
  /** @type {WeakMap<HTMLVideoElement, {recorder: MediaRecorder, chunks: Blob[], startTime: number, timerInterval: number|null}>} */
  #map = new WeakMap();
  #site = location.hostname;

  isRecording(video) { return this.#map.get(video)?.recorder.state === 'recording'; }

  elapsedSeconds(video) {
    const st = this.#map.get(video);
    return st ? (Date.now() - st.startTime) / 1000 : 0;
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {{ onStart: Function, onStop: Function }} callbacks
   */
  toggle(video, { onStart, onStop }) {
    const existing = this.#map.get(video);
    if (existing && existing.recorder.state === 'recording') {
      existing.recorder.stop();
      return;
    }
    try {
      const stream = video.captureStream();
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const state = { recorder, chunks: [], startTime: Date.now(), timerInterval: null };
      this.#map.set(video, state);

      recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
      recorder.onstop = () => {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        onStop();
        const blob = new Blob(state.chunks, { type: 'video/webm' });
        const a = document.createElement('a');
        a.download = `capture-${this.#site}-${Date.now()}.webm`;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        this.#map.delete(video);
      };

      recorder.start(1000);
      state.timerInterval = setInterval(onStart, 1000);
      onStart();
    } catch {
      return false; // blocked (protected or cross-origin)
    }
    return true;
  }
}
