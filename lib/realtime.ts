let seq = 0;

/**
 * Appends a per-call unique suffix to a realtime channel name.
 *
 * Supabase's client reuses any existing channel object that shares the
 * exact same name (`RealtimeClient.channel()` looks up by topic and hands
 * back the existing instance instead of creating a new one). Our effect
 * cleanups call `removeChannel()`, which is async (it awaits a network
 * unsubscribe before tearing the channel down) — a `useEffect` cleanup
 * fires it without awaiting. If the same screen mounts again before that
 * finishes, the next `.channel(name)` call gets handed back the previous,
 * already-subscribed channel instead of a fresh one, and `.on()` throws
 * "cannot add ... callbacks ... after subscribe()".
 *
 * A unique name per effect run sidesteps the race entirely — nothing else
 * needs to address these channels by name, so uniqueness has no downside.
 */
export function uniqueChannelName(base: string): string {
  seq += 1;
  return `${base}-${Date.now()}-${seq}`;
}
