"use client";
import { useVoiceControls, useVoiceState, useVoiceVolume } from "@assistant-ui/react";

export function VoiceButton() {
  const state = useVoiceState();
  const { connect, disconnect, mute, unmute } = useVoiceControls();
  const volume = useVoiceVolume();

  const status = state?.status.type;
  const live = status === "running" || status === "starting";

  if (!live) {
    return (
      <button
        onClick={connect}
        className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        title="Start voice mode"
      >
        Voice
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 rounded-full bg-emerald-500 transition-transform"
        style={{ transform: `scale(${1 + Math.min(volume, 1) * 1.6})` }}
      />
      <span className="text-xs text-neutral-500">
        {status === "starting" ? "connecting…" : state?.mode ?? "listening"}
      </span>
      <button
        onClick={() => (state?.isMuted ? unmute() : mute())}
        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
      >
        {state?.isMuted ? "Unmute" : "Mute"}
      </button>
      <button
        onClick={disconnect}
        className="rounded-lg bg-red-500 px-2 py-1 text-xs text-white"
      >
        End
      </button>
    </div>
  );
}
