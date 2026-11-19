import { canSelfUpdate, installUpdate, useUpdate } from "../platform/update";
import { Icon } from "./icons";

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;

/** "Jest aktualizacja" card: download progress, then the system installer. Shows only while there is something to say. */
export function UpdateBanner() {
  const s = useUpdate();
  if (!canSelfUpdate()) return null;
  switch (s.phase) {
    case "available":
      return (
        <section className="panel update" role="status">
          <div><b>Jest aktualizacja</b><span className="sub">Echo {s.update.version}{s.update.size ? ` · ${mb(s.update.size)}` : ""}</span></div>
          <button className="btn" onClick={installUpdate}><Icon name="import" /> Pobierz i zainstaluj</button>
        </section>
      );
    case "downloading": {
      const pct = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
      return (
        <section className="panel update" role="status">
          <div><b>Pobieram Echo {s.update.version}… {pct}%</b><span className="sub">Możesz dalej się uczyć. Na koniec Android zapyta, czy zainstalować.</span></div>
          <span className="bar update-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        </section>
      );
    }
    case "installing":
      return (
        <section className="panel update" role="status">
          <div><b>Echo {s.update.version} pobrane</b><span className="sub">Potwierdź instalację w oknie Androida. Postępy zostaną.</span></div>
          <button className="btn btn-quiet" onClick={installUpdate}>Zainstaluj</button>
        </section>
      );
    case "permission":
      return (
        <section className="panel update" role="status">
          <div><b>Pozwól Echo instalować aktualizacje</b><span className="sub">W ustawieniach, które się otworzyły, włącz „Zezwalaj z tego źródła”, wróć tutaj i dotknij Zainstaluj.</span></div>
          <button className="btn" onClick={installUpdate}>Zainstaluj</button>
        </section>
      );
    case "failed":
      return (
        <section className="panel update" role="status">
          <div><b>Nie udało się zaktualizować do Echo {s.update.version}</b><span className="sub">Sprawdź internet i spróbuj jeszcze raz.</span></div>
          <button className="btn btn-quiet" onClick={installUpdate}>Spróbuj ponownie</button>
        </section>
      );
    default:
      return null;
  }
}
