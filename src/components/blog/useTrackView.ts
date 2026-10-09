import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { sessionId } from "@/lib/api";

/** Records one anonymous view with the time spent, sent when the reader leaves. */
export function useTrackView(postId: string, path: string) {
  useEffect(() => {
    if (!supabase || postId.startsWith("p")) return;
    const start = Date.now();
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      void supabase!.rpc("track_view", {
        _post_id: postId,
        _path: path,
        _session: sessionId(),
        _seconds: Math.round((Date.now() - start) / 1000),
        _referrer: document.referrer || null,
      });
    };
    const onHide = () => document.visibilityState === "hidden" && send();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [postId, path]);
}
