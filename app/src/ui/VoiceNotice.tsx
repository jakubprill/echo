import { useEffect, useState } from "react";
import { hasEnglishVoice, ttsAvailable } from "../platform/tts";

/** Ostrzeżenie, gdy system nie ma angielskiego głosu (częste na polskim Windowsie). */
export function VoiceNotice() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    if (ttsAvailable()) void hasEnglishVoice().then((ok) => live && setMissing(!ok));
    return () => {
      live = false;
    };
  }, []);
  if (!missing) return null;
  return (
    <p className="notice notice-warn" role="status">
      Na tym urządzeniu nie ma angielskiego głosu, więc lektor milczy. W systemie Windows dodasz go w: Ustawienia → Czas i język → Mowa → Dodaj głosy → English (United Kingdom). Potem uruchom Echo ponownie.
    </p>
  );
}
