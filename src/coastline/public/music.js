// Original slow ambient progression. Locally synthesized, no samples or streaming.
export function createMusic() {
  let ctx = null,
    master = null,
    filter = null,
    timer = null,
    next = 0,
    step = 0,
    enabled = localStorage.getItem("coastline.music") !== "off",
    vol = Number(localStorage.getItem("coastline.volume") || 0.16);
  const chords = [
    [50, 57, 60, 64],
    [46, 53, 57, 60],
    [48, 55, 59, 62],
    [45, 52, 55, 59],
  ];
  function tone(note, time, duration, level, type = "sine") {
    let o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = type;
    o.frequency.value = 440 * 2 ** ((note - 69) / 12);
    o.detune.value = Math.sin(note) * 3;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(level, time + 0.65);
    g.gain.setTargetAtTime(0.0001, time + duration * 0.52, duration * 0.2);
    o.connect(g);
    g.connect(filter);
    o.start(time);
    o.stop(time + duration + 1);
  }
  function schedule() {
    if (!ctx || ctx.state !== "running" || !enabled) return;
    while (next < ctx.currentTime + 0.3) {
      let chord = chords[Math.floor(step / 8) % 4];
      if (step % 8 === 0) {
        for (let note of chord) tone(note, next, 6.8, 0.065, "triangle");
        tone(chord[0] - 12, next, 6.2, 0.09);
      }
      if (step % 2 === 0)
        tone(chord[(step / 2) % 4] + 12, next + 0.1, 2.5, 0.032);
      next += 60 / 68;
      step++;
    }
  }
  async function resume() {
    if (!enabled || document.hidden) return;
    try {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = vol;
        filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 1600;
        filter.Q.value = 0.5;
        filter.connect(master);
        let delay = ctx.createDelay(1);
        delay.delayTime.value = 0.44;
        let feedback = ctx.createGain();
        feedback.gain.value = 0.2;
        filter.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        feedback.connect(master);
        master.connect(ctx.destination);
      }
      if (!timer) timer = setInterval(schedule, 100);
      await ctx.resume();
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
      schedule();
    } catch {}
  }
  function pause() {
    clearInterval(timer);
    timer = null;
    ctx?.suspend();
  }
  return {
    get enabled() {
      return enabled;
    },
    get volume() {
      return vol;
    },
    set volume(v) {
      vol = v;
      localStorage.setItem("coastline.volume", v);
      if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.15);
    },
    resume,
    pause,
    toggle() {
      enabled = !enabled;
      localStorage.setItem("coastline.music", enabled ? "on" : "off");
      if (enabled) resume();
      else pause();
    },
  };
}
