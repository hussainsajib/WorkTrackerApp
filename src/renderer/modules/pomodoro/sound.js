// Short buzzer played whenever a phase (focus or break) ends — synthesized with the
// Web Audio API so no bundled sound file/asset is needed.
export async function playBuzzSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    // Chromium can auto-suspend audio contexts on hidden/backgrounded
    // documents — this is exactly when we most need the buzz to play.
    await ctx.resume();
    const now = ctx.currentTime;
    const buzzCount = 3;
    const buzzDuration = 0.14;
    const gap = 0.18;
    for (let i = 0; i < buzzCount; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 220;
      const start = now + i * gap;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + buzzDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + buzzDuration + 0.02);
    }
    setTimeout(() => ctx.close(), (buzzCount * gap + 0.5) * 1000);
  } catch (err) {
    console.error('Failed to play buzz sound', err);
  }
}
