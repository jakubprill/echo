// Port plików: wybór pliku do wczytania i zapis pliku.
import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

/** Otwiera systemowe okno wyboru pliku i zwraca jego treść (null po anulowaniu). */
export function pickTextFile(accept = ".json,application/json"): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** W artefakcie Claude przeglądarka blokuje pobieranie, więc zostaje kopiowanie tekstu. */
export const canSaveFiles = (): boolean => __ECHO_TARGET__ !== "artifact";

export async function saveTextFile(name: string, content: string): Promise<"saved" | "cancelled"> {
  if (isTauri()) {
    const path = await save({ defaultPath: name, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return "cancelled";
    await writeTextFile(path, content);
    return "saved";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "saved";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
