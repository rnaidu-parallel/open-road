export const STATIONS = [
  {
    id: "main",
    name: "Simulator Radio",
    url: "https://simulatorradio.stream/stream",
  },
  { id: "rock", name: "SR Rock", url: "https://simulatorradio.stream/rock" },
  { id: "dance", name: "SR Dance", url: "https://simulatorradio.stream/dance" },
];

export function createRadio(onChange) {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "none";
  audio.volume = 0.32;
  let station = STATIONS[0],
    wanted = false,
    status = "Off",
    request = 0,
    captureSource;
  const notify = () => onChange({ station: station.id, wanted, status });
  audio.addEventListener("playing", () => {
    status = "Live";
    notify();
  });
  audio.addEventListener("waiting", () => {
    if (wanted) {
      status = "Buffering…";
      notify();
    }
  });
  audio.addEventListener("error", () => {
    wanted = false;
    status = "Station unavailable · retry";
    notify();
  });
  async function play() {
    const current = ++request;
    wanted = true;
    status = "Connecting…";
    notify();
    if (audio.src !== station.url) audio.src = station.url;
    try {
      await audio.play();
    } catch (error) {
      if (current !== request) return;
      wanted = false;
      status =
        error.name === "NotAllowedError"
          ? "Press play to listen"
          : "Station unavailable · retry";
      notify();
    }
  }
  function stop() {
    request++;
    wanted = false;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    status = "Off";
    notify();
  }
  return {
    play,
    stop,
    capture(context, destination) {
      if (!captureSource) {
        captureSource = context.createMediaElementSource(audio);
        captureSource.connect(context.destination);
      }
      captureSource.connect(destination);
      return () => captureSource.disconnect(destination);
    },
    toggle: () => (wanted ? stop() : play()),
    async select(id) {
      const next = STATIONS.find((item) => item.id === id);
      if (!next || next === station) return;
      const resume = wanted;
      stop();
      station = next;
      if (resume) await play();
      else notify();
    },
    setVolume: (value) => {
      audio.volume = Math.max(0, Math.min(1, value));
    },
    setMuted: (muted) => {
      audio.muted = muted;
    },
    diagnostics: () => ({
      station: station.name,
      wanted,
      status,
      playing: !audio.paused,
      time: audio.currentTime,
      readyState: audio.readyState,
      volume: audio.volume,
      muted: audio.muted,
      error: audio.error?.message ?? null,
    }),
  };
}
