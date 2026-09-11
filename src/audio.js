import { clamp } from "./driving.js";
import { engineMix } from "./engine-mix.js";
export function createAudio() {
  let context,
    master,
    compressor,
    initializing,
    enabled = true,
    loaded = false,
    lastMix = {},
    analyser,
    meter;
  const layers = {};

  function noise(type, frequency, q = 0.7, bright = false) {
    const source = context.createBufferSource(),
      buffer = context.createBuffer(
        1,
        context.sampleRate * 4,
        context.sampleRate,
      ),
      data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = (previous + Math.random() * 0.04 - 0.02) / 1.02;
      data[i] = bright ? (Math.random() * 2 - 1) * 0.5 : previous * 4;
    }
    source.buffer = buffer;
    source.loop = true;
    return connect(source, type, frequency, q);
  }
  function connect(source, type, frequency, q) {
    const filter = context.createBiquadFilter(),
      gain = context.createGain();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q ?? 0.7;
    gain.gain.value = 0;
    const meter = context.createAnalyser(),
      sourceMeter = context.createAnalyser();
    meter.fftSize = sourceMeter.fftSize = 256;
    source
      .connect(sourceMeter)
      .connect(filter)
      .connect(gain)
      .connect(meter)
      .connect(master);
    source.start();
    return { source, filter, gain, meter, sourceMeter };
  }
  async function sample(name, file, filter = "lowpass", frequency = 18000) {
    const response = await fetch("/audio/" + file);
    if (!response.ok) throw new Error("Audio asset failed: " + file);
    const buffer = await context.decodeAudioData(await response.arrayBuffer()),
      source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    layers[name] = connect(source, filter, frequency);
  }
  async function initialize() {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.5;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    meter = new Float32Array(1024);
    master.connect(compressor).connect(analyser).connect(context.destination);
    const resume = context.resume();
    layers.road = noise("bandpass", 650, 0.7);
    layers.air = noise("lowpass", 900);
    layers.intake = noise("bandpass", 1700, 1.2);
    const turboTone = context.createOscillator();
    turboTone.type = "sine";
    turboTone.frequency.value = 850;
    layers.turbo = connect(turboTone, "lowpass", 6500, 0.7);
    layers.turboAir = noise("bandpass", 2500, 0.8, true);
    layers.blowoff = noise("highpass", 1200, 0.7, true);
    layers.exhaust = noise("lowpass", 750, 0.7, true);
    layers.brake = noise("bandpass", 2900, 2.5);
    layers.ambient = noise("lowpass", 500);
    await Promise.all([
      resume,
      sample("engine", "v8-power.wav", "lowpass", 6500),
      sample("overrun", "v8-overrun.wav", "lowpass", 5500),
      sample("rain", "rain.mp3"),
      sample("forest", "forest.mp3"),
      sample("skid", "skid-clean.wav", "lowpass", 4000),
    ]);
    loaded = true;
  }
  async function unlock() {
    if (!enabled) return;
    if (!initializing) initializing = initialize();
    await initializing;
    if (context.state !== "running") await context.resume();
  }
  return {
    unlock,
    async capture() {
      if (!enabled) await this.toggle();
      await unlock();
      const destination = context.createMediaStreamDestination();
      analyser.connect(destination);
      return {
        context,
        destination,
        disconnect: () => analyser.disconnect(destination),
      };
    },
    async toggle() {
      enabled = !enabled;
      if (enabled) await unlock();
      if (context)
        master.gain.setTargetAtTime(
          enabled ? 0.5 : 0,
          context.currentTime,
          0.12,
        );
      return enabled;
    },
    diagnostics() {
      const signal = (node) => {
        const a = new Float32Array(node.fftSize);
        node.getFloatTimeDomainData(a);
        return {
          rms: Math.sqrt(a.reduce((n, v) => n + v * v, 0) / a.length),
          invalid: a.filter((v) => !Number.isFinite(v)).length,
        };
      };
      let rms = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(meter);
        rms = Math.sqrt(meter.reduce((n, v) => n + v * v, 0) / meter.length);
      }
      return {
        enabled,
        loaded,
        context: context?.state ?? "locked",
        time: context?.currentTime,
        rms,
        voices: Object.fromEntries(
          Object.entries(layers).map(([name, l]) => [
            name,
            {
              loop: l.source.loop ?? true,
              gain: l.gain.gain.value,
              rate: l.source.playbackRate?.value ?? 1,
              tone: l.source.frequency?.value,
              frequency: l.filter.frequency.value,
              signal: signal(l.meter),
              sourceSignal: signal(l.sourceMeter),
            },
          ]),
        ),
        ...lastMix,
      };
    },
    update(state, wetness, precipitation, landscape, snowFraction = 0) {
      if (!loaded) return;
      const now = context.currentTime,
        velocity = clamp(state.speed / 50, 0, 1),
        load = state.throttle;
      const set = (name, amount) =>
        layers[name].gain.gain.setTargetAtTime(amount, now, 0.1);
      const mix = engineMix(state, now);
      for (const name of ["engine", "overrun"]) {
        layers[name].source.playbackRate.setTargetAtTime(mix.rate, now, 0.06);
        layers[name].filter.frequency.setTargetAtTime(mix.frequency, now, 0.12);
      }
      set("engine", mix.power);
      set("overrun", mix.overrun);
      const shift = state.shiftTime > 0 ? 0.65 : 1;
      set("intake", load * velocity * 0.13 * shift);
      set("turbo", mix.turbo);
      layers.turbo.source.frequency.setTargetAtTime(
        850 + (state.boost ?? 0) * 2350 + state.rpm * 0.045,
        now,
        0.13,
      );
      set("turboAir", (state.boost ?? 0) * 0.24);
      layers.blowoff.gain.gain.setTargetAtTime(
        (state.blowoff ?? 0) * 0.7,
        now,
        0.008,
      );
      layers.exhaust.gain.gain.setTargetAtTime(
        (state.exhaust ?? 0) * 0.25,
        now,
        0.006,
      );
      set("road", velocity ** 1.5 * (0.34 + wetness * 0.5));
      layers.road.filter.frequency.setTargetAtTime(
        400 + velocity * 800 + wetness * 900,
        now,
        0.2,
      );
      set("air", velocity ** 2 * 0.55);
      const skid =
        state.speed > 8
          ? clamp(Math.abs(state.lateralG) - 0.62, 0, 0.4) +
            (state.braking ? 0.08 : 0) +
            (state.edgeContact ? 0.25 : 0) +
            state.driftAmount * 0.6
          : 0;
      set("skid", skid * 0.24 * (1 - wetness * 0.35));
      set(
        "brake",
        state.braking && state.speed > 1
          ? 0.065 * Math.min(1, state.speed / 10)
          : 0,
      );
      layers.brake.filter.frequency.setTargetAtTime(
        2100 + state.speed * 25,
        now,
        0.1,
      );
      set("rain", precipitation * (1 - snowFraction) * 0.48);
      const forest = landscape.from === "forest" ? 1 - landscape.mix : 0;
      const nextForest = landscape.to === "forest" ? landscape.mix : 0;
      set(
        "forest",
        (forest + nextForest) *
          0.38 *
          (1 - wetness * 0.65) *
          (1 - velocity * 0.7),
      );
      const amounts = { forest: 0.04, desert: 0.32, snow: 0.23, night: 0.065 };
      set(
        "ambient",
        (amounts[landscape.from] * (1 - landscape.mix) +
          amounts[landscape.to] * landscape.mix) *
          (1 + 0.3 * Math.sin(now * 0.3)),
      );
      const frequencies = { forest: 500, desert: 800, snow: 400, night: 350 };
      layers.ambient.filter.frequency.setTargetAtTime(
        frequencies[landscape.from] * (1 - landscape.mix) +
          frequencies[landscape.to] * landscape.mix,
        now,
        1,
      );
      lastMix = {
        rpm: Math.round(state.rpm),
        engineRate: mix.rate,
        boost: state.boost,
        blowoff: state.blowoff,
        exhaust: state.exhaust,
        powerGain: mix.power,
        overrunGain: mix.overrun,
        throttle: load,
        braking: state.braking,
        skid,
        wetness,
        landscape: landscape.to,
      };
    },
  };
}
