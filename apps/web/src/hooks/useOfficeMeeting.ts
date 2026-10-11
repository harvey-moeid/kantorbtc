import { useEffect, useMemo, useRef, useState } from "react";
import {
  presentationAt,
  type MeetingEvent,
} from "../../../../packages/shared/src/presentation";
import type { Meeting } from "../../../../packages/shared/src/domain";
import { useStore } from "../store";
import { useVisibility } from "./useVisibility";
export function useOfficeMeeting() {
  const incoming = useStore((s) => s.meetingEvent),
    demo = useStore((s) => s.demo),
    publicView = useStore((s) => s.publicView),
    language = useStore((s) => s.settings.language),
    visible = useVisibility();
  const [event, setEvent] = useState<MeetingEvent | null>(null),
    [elapsed, setElapsed] = useState(0),
    [paused, setPaused] = useState(false),
    [speed, setSpeed] = useState(1),
    [manual, setManual] = useState(false),
    seen = useRef<string | null>(null);
  useEffect(() => {
    if (!incoming || demo) return;
    if (seen.current !== incoming.id) {
      seen.current = incoming.id;
      if (
        manual ||
        (["approved", "rejected"].includes(incoming.phase) &&
          Date.now() - incoming.at > 80000)
      )
        return;
      setEvent(incoming);
      setElapsed(Math.max(0, (Date.now() - incoming.at) / 1000));
      setPaused(false);
      setSpeed(1);
    } else if (!manual)
      setEvent((previous) =>
        previous?.id === incoming.id ? incoming : previous,
      );
  }, [incoming, demo, manual]);
  const frame = useMemo(
    () => (event ? presentationAt(event, elapsed, publicView, language) : null),
    [event, elapsed, publicView, language],
  );
  useEffect(() => {
    if (!event || paused || !visible || frame?.complete) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        delta = Math.min(0.5, (now - previous) / 1000) * speed;
      previous = now;
      setElapsed((old) => {
        const next = old + delta,
          current = presentationAt(event, next, publicView, language);
        if (current.waitAt !== null) return Math.min(next, current.waitAt);
        return next;
      });
    }, 125);
    return () => clearInterval(timer);
  }, [event, paused, visible, speed, frame?.complete, publicView, language]);
  const replay = (meeting: Meeting) => {
    setManual(true);
    setEvent({
      id: `replay-${meeting.id}-${Date.now()}`,
      phase: meeting.phase,
      at: Date.now(),
      aiTriggered: meeting.votes.length > 0,
      details: meeting,
    });
    setElapsed(0);
    setPaused(false);
    setSpeed(1);
  };
  const stop = () => {
    setEvent(null);
    setElapsed(0);
    setPaused(false);
    setManual(false);
  };
  return {
    event,
    frame,
    elapsed,
    paused,
    speed,
    manual,
    replay,
    stop,
    togglePause: () => setPaused((p) => !p),
    seek: (value: number) =>
      setElapsed(Math.max(0, Math.min(frame?.duration || 80, value))),
    setSpeed,
  };
}
