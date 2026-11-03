// PCM capture stays off the UI thread. The requested context is 16 kHz;
// resample if a browser chooses a different hardware rate.
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.phase = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input)
      for (const sample of input) {
        this.phase += 16000;
        if (this.phase >= sampleRate) {
          this.phase -= sampleRate;
          this.samples.push(
            Math.max(-32768, Math.min(32767, Math.round(sample * 32767))),
          );
          if (this.samples.length === 1600) {
            const bytes = new ArrayBuffer(3200);
            const view = new DataView(bytes);
            this.samples.forEach((value, index) =>
              view.setInt16(index * 2, value, true),
            );
            this.port.postMessage(bytes, [bytes]);
            this.samples = [];
          }
        }
      }
    return true;
  }
}
registerProcessor("voice-capture", VoiceCapture);
