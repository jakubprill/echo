import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { leaveProfile } from "../App";
import { activeProfile, selectProfile, type Profile } from "../core/profiles";
import { updateHousehold, useHousehold } from "../state/store";
import { Icon } from "../ui/icons";

const HOLD_MS = 1300;

/**
 * The child's avatar in the Kids header. It opens "Kto gra?": siblings switch with one tap,
 * adult profiles appear only after a parent holds the gate button.
 */
export function KidsSwitch() {
  const me = activeProfile(useHousehold());
  const [open, setOpen] = useState(false);
  if (!me) return null;
  return (
    <>
      <button className="kround kme" aria-haspopup="dialog" aria-label={`Gra ${me.name}. Zmień, kto gra`} onClick={() => setOpen(true)}>
        <span aria-hidden="true">{me.avatar}</span>
      </button>
      {open && <KidsSheet me={me} onClose={() => setOpen(false)} />}
    </>
  );
}

function KidsSheet({ me, onClose }: { me: Profile; onClose: () => void }) {
  const h = useHousehold();
  const [parent, setParent] = useState(false);
  const [hold, setHold] = useState(false);
  const [tip, setTip] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (id: string) => {
    onClose();
    if (id !== me.id) updateHousehold((x) => selectProfile(x, id));
  };
  const stop = () => {
    if (!hold) return;
    clearTimeout(t.current);
    setHold(false);
    // A short tap explains the gesture instead of doing nothing.
    setTip(true);
  };
  const kids = h.profiles.filter((p) => p.kind === "kids");
  const adults = h.profiles.filter((p) => p.kind === "adults");
  // Rendered at the app root so the header's stacking does not clip the overlay.
  const root = document.querySelector(".echo") ?? document.body;
  return createPortal(
    <div className="ksheet-back" onClick={onClose}>
      <div className="ksheet" role="dialog" aria-modal="true" aria-labelledby="kids-switch-title" onClick={(e) => e.stopPropagation()}>
        <div className="ksheet-head">
          <h2 id="kids-switch-title">Kto gra?</h2>
          <button className="kround" aria-label="Zamknij" onClick={onClose}><Icon name="close" size={30} /></button>
        </div>
        <div className="kswitch-grid">
          {kids.map((p) => (
            <button key={p.id} className={`kswitch-kid${p.id === me.id ? " on" : ""}`} aria-current={p.id === me.id || undefined} onClick={() => pick(p.id)}>
              <span aria-hidden="true">{p.avatar}</span>
              <b>{p.name}</b>
              <small>{p.id === me.id ? "Teraz grasz" : `${p.kids.stars} ★`}</small>
            </button>
          ))}
        </div>
        {parent ? (
          <div className="kswitch-parent">
            <p>Dorośli</p>
            {adults.map((p) => (
              <button key={p.id} className="kswitch-adult" onClick={() => pick(p.id)}>
                <span aria-hidden="true">{p.avatar}</span>
                <b>{p.name}</b>
                <small>Echo</small>
              </button>
            ))}
            <button className="kswitch-adult kswitch-manage" onClick={() => { onClose(); leaveProfile(); }}>
              <Icon name="settings" /> <b>Dodaj lub zmień profile</b>
            </button>
          </div>
        ) : (
          <>
            <button
              className={`kgate${hold ? " hold" : ""}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setHold(true);
                setTip(false);
                t.current = setTimeout(() => { setHold(false); setParent(true); }, HOLD_MS);
              }}
              onPointerUp={stop}
              onPointerCancel={stop}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => e.key === "Enter" && setParent(true)}
            >
              <i aria-hidden="true" />
              <Icon name="lock" /> <span>Dla rodzica: przytrzymaj</span>
            </button>
            {tip && <p className="kgate-tip" role="status">Rodzicu: przytrzymaj przycisk, aż pasek się wypełni.</p>}
          </>
        )}
      </div>
    </div>,
    root,
  );
}
