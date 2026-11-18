import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initStore } from "./state/store";
import { watchInsets } from "./platform/insets";
import { checkForUpdate } from "./platform/update";
import "./styles/tokens.css";
import "./styles/adult.css";
import "./styles/kids.css";

watchInsets();
void initStore().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Android: look for a newer release in the background; the profile chooser, Home and Settings show it.
  void checkForUpdate(true);
});
