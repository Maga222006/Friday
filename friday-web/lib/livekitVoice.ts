"use client";
import { createVoiceSession, type RealtimeVoiceAdapter } from "@assistant-ui/react";
import { Room, RoomEvent, Track, type RemoteTrack, type TranscriptionSegment, type Participant } from "livekit-client";
import { fetchVoiceToken, type User } from "./chatApi";

/**
 * Bridges assistant-ui's voice adapter to the LiveKit room your Python worker
 * joins. The worker holds the agent; this side only carries audio and
 * transcripts. The call runs on the thread that's open in the UI.
 */
export function createLiveKitVoiceAdapter({
  getUser,
  getThreadId,
  onEnded,
}: {
  getUser: () => User | null;
  /** remote id of the open thread, creating it first if it's still a draft */
  getThreadId: () => Promise<string>;
  onEnded?: () => void;
}): RealtimeVoiceAdapter {
  return {
    connect: ({ abortSignal }) =>
      createVoiceSession({ abortSignal }, async (h) => {
        const user = getUser();
        if (!user) throw new Error("No profile selected");

        h.setStatus({ type: "starting" });

        const threadId = await getThreadId();
        const { url, token } = await fetchVoiceToken(user.id, threadId);
        const room = new Room({ adaptiveStream: true, dynacast: true });
        const audioEls: HTMLAudioElement[] = [];

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach() as HTMLAudioElement;
          el.style.display = "none";
          document.body.appendChild(el);
          audioEls.push(el);
        });

        // browsers may block playback that didn't start inside a click: resume on the next one
        const unlock = () => void room.startAudio();
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!room.canPlaybackAudio) document.addEventListener("click", unlock, { once: true });
        });

        room.on(
          RoomEvent.TranscriptionReceived,
          (segments: TranscriptionSegment[], participant?: Participant) => {
            const isLocal = participant?.identity === room.localParticipant.identity;
            for (const s of segments) {
              if (!s.text) continue;
              h.emitTranscript({
                role: isLocal ? "user" : "assistant",
                text: s.text,
                isFinal: s.final,
              });
            }
          },
        );

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const agentSpeaking = speakers.some(
            (p) => p.identity !== room.localParticipant.identity,
          );
          h.emitMode(agentSpeaking ? "speaking" : "listening");
        });

        let ended = false;
        // cheap mic level meter for the UI
        const meter = setInterval(() => {
          if (h.isDisposed()) return;
          h.emitVolume(room.localParticipant.audioLevel ?? 0);
        }, 120);
        const teardown = () => {
          if (ended) return;
          ended = true;
          clearInterval(meter);
          document.removeEventListener("click", unlock);
          for (const el of audioEls) {
            el.remove();
          }
          audioEls.length = 0;
          void room.disconnect();
          onEnded?.();
        };

        room.on(RoomEvent.Disconnected, () => {
          teardown();
          if (!h.isDisposed()) h.end("finished");
        });

        await room.connect(url, token);
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.startAudio().catch(() => {});

        h.setStatus({ type: "running" });
        h.emitMode("listening");

        return {
          disconnect: () => {
            teardown();
            if (!h.isDisposed()) h.end("cancelled");
          },
          mute: () => void room.localParticipant.setMicrophoneEnabled(false),
          unmute: () => void room.localParticipant.setMicrophoneEnabled(true),
        };
      }),
  };
}
