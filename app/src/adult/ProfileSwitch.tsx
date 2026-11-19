import { useEffect } from "react";
import { leaveProfile } from "../App";
import { activeProfile, selectProfile } from "../core/profiles";
import { updateHousehold, useHousehold } from "../state/store";
import { Icon } from "../ui/icons";

/**
 * Profile button in the navigation: shows who is learning and switches to another profile in two taps.
 * Kids profiles are listed too, so a parent can hand the device to a child without going through the chooser.
 */
export function ProfileButton({ onOpen }: { onOpen: () => void }) {
  const me = activeProfile(useHousehold());
  if (!me) return null;
  return (
    <button className="rail-me" aria-haspopup="dialog" aria-label={`Profil: ${me.name}. Zmień profil`} onClick={onOpen}>
      <span className="rail-avatar" aria-hidden="true">{me.avatar}</span>
      <span className="rail-name">{me.name}</span>
    </button>
  );
}

/** Rendered outside the navigation so the rail's button styles do not apply. */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const h = useHousehold();
  const me = activeProfile(h);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!me) return null;
  const others = h.profiles.filter((p) => p.id !== me.id);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet panel" role="dialog" aria-modal="true" aria-labelledby="switch-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="switch-title">Kto się teraz uczy?</h2>
          <button className="round" aria-label="Zamknij" onClick={onClose}><Icon name="close" /></button>
        </div>
        <ul className="switch-list">
          <li>
            <button className="switch-item on" aria-current="true" onClick={onClose}>
              <span className="switch-avatar" aria-hidden="true">{me.avatar}</span>
              <b>{me.name}</b>
              <small>Teraz</small>
            </button>
          </li>
          {others.map((p) => (
            <li key={p.id}>
              <button className="switch-item" onClick={() => { onClose(); updateHousehold((x) => selectProfile(x, p.id)); }}>
                <span className="switch-avatar" aria-hidden="true">{p.avatar}</span>
                <b>{p.name}</b>
                <small className={p.kind === "kids" ? "switch-kids" : undefined}>{p.kind === "kids" ? "Echo Kids" : "Echo"}</small>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-quiet" onClick={() => { onClose(); leaveProfile(); }}><Icon name="settings" /> {others.length ? "Dodaj lub zmień profile" : "Dodaj profil"}</button>
      </div>
    </div>
  );
}
