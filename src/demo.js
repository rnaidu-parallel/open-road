// Capture the actual game canvas and its audio, without recording the desktop.
export function createDemo({
  canvas,
  audio,
  radio,
  startDrive,
  startRain,
  startNight,
}) {
  const panel = document.createElement("div");
  panel.className = "demo-panel";
  panel.innerHTML =
    '<button disabled>Record drive</button><span role="status">Preparing…</span><a hidden>Download video</a>';
  document.body.append(panel);
  const button = panel.querySelector("button");
  const label = panel.querySelector("span");
  const download = panel.querySelector("a");
  let recorder, stream, mix, disconnectRadio, objectURL;
  let started = 0,
    nightAt = 0,
    radioAt = 0,
    rainStarted = false,
    nightStarted = false;
  let result = { status: "Preparing" },
    samples = [];
  const status = (message) => {
    label.textContent = message;
    result.status = message;
  };
  const release = () => {
    stream?.getTracks().forEach((track) => track.stop());
    disconnectRadio?.();
    mix?.disconnect();
    disconnectRadio = mix = stream = null;
  };
  button.addEventListener("click", async () => {
    if (objectURL) {
      location.assign("?demo");
      return;
    }
    button.disabled = true;
    download.hidden = true;
    status("Connecting audio…");
    try {
      if (!canvas.captureStream || !window.MediaRecorder)
        throw new Error("Video recording is unavailable in this browser.");
      radio.stop();
      await radio.select("main");
      radio.setMuted(false);
      mix = await audio.capture();
      disconnectRadio = radio.capture(mix.context, mix.destination);
      stream = canvas.captureStream(30);
      for (const track of mix.destination.stream.getAudioTracks())
        stream.addTrack(track);
      const mimeType = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 9_000_000,
        audioBitsPerSecond: 192_000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        result.error = event.error?.message ?? "Recording failed";
        recorder.stop();
      };
      recorder.onstop = () => {
        result.seconds = (performance.now() - started) / 1000;
        result.fps = {
          min: Math.min(...samples),
          average:
            samples.reduce((sum, value) => sum + value, 0) / samples.length,
        };
        release();
        if (objectURL) URL.revokeObjectURL(objectURL);
        const blob = new Blob(chunks, { type: recorder.mimeType });
        objectURL = URL.createObjectURL(blob);
        download.href = objectURL;
        download.download = `open-road-day-rain-night.${recorder.mimeType.includes("mp4") ? "mp4" : "webm"}`;
        download.hidden = false;
        result.bytes = blob.size;
        status(result.error ? `Recorded · ${result.error}` : "Video ready");
        button.textContent = "Record again";
        // A new drive guarantees that repeat clips also begin in dry daylight.
        button.disabled = false;
      };
      startDrive();
      samples = [];
      result = { status: "Daytime", events: [{ at: 0, phase: "day" }] };
      started = performance.now();
      nightAt = radioAt = 0;
      rainStarted = nightStarted = false;
      recorder.start(1000);
      status("Recording · daytime");
    } catch (error) {
      release();
      status(error.message);
      button.disabled = false;
    }
  });
  return {
    enable() {
      button.disabled = false;
      status("Day → rain → night · about 50 seconds");
    },
    diagnostics: () => result,
    update(now, nightFraction, fps) {
      if (recorder?.state !== "recording") return;
      const seconds = (now - started) / 1000;
      samples.push(fps);
      if (!rainStarted && seconds >= 10) {
        rainStarted = true;
        startRain();
        result.events.push({ at: seconds, phase: "rain" });
        status("Recording · rain gathering");
      }
      if (!nightStarted && seconds >= 27) {
        nightStarted = true;
        startNight();
        result.events.push({ at: seconds, phase: "night transition" });
        status("Recording · dusk ahead");
      }
      if (nightStarted && !nightAt && nightFraction >= 0.98) {
        nightAt = now;
        radio.play();
        result.events.push({ at: seconds, phase: "night" });
        status("Recording · night / connecting radio");
      }
      if (nightAt && !radioAt && radio.diagnostics().status === "Live") {
        radioAt = now;
        result.events.push({ at: seconds, phase: "Simulator Radio playing" });
        status("Recording · night / Simulator Radio");
      }
      if (radioAt && now - radioAt >= 14_000) recorder.stop();
      else if (seconds >= 75) {
        result.error = radioAt
          ? "Sequence timed out"
          : "Radio did not start; retry the recording";
        recorder.stop();
      }
    },
  };
}
