interface RecordState {
  recorder: MediaRecorder;
  chunks: Blob[];
  startTime: number;
  timerInterval: ReturnType<typeof setInterval> | null;
}

interface RecordCallbacks {
  onStart: () => void;
  onStop: () => void;
}

export class VideoRecorder {
  #map = new WeakMap<HTMLVideoElement, RecordState>();
  #site = location.hostname;

  isRecording(video: HTMLVideoElement | null): boolean {
    if (!video) return false;
    return this.#map.get(video)?.recorder.state === 'recording';
  }

  elapsedSeconds(video: HTMLVideoElement): number {
    const st = this.#map.get(video);
    return st ? (Date.now() - st.startTime) / 1000 : 0;
  }

  toggle(video: HTMLVideoElement, { onStart, onStop }: RecordCallbacks): boolean {
    const existing = this.#map.get(video);
    if (existing && existing.recorder.state === 'recording') {
      existing.recorder.stop();
      return true;
    }
    try {
      const stream = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const state: RecordState = { recorder, chunks: [], startTime: Date.now(), timerInterval: null };
      this.#map.set(video, state);

      recorder.ondataavailable = (e) => {
        if (e.data.size) state.chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (state.timerInterval) clearInterval(state.timerInterval);
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
