import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initStore } from "./state/store";
import { watchInsets } from "./platform/insets";
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
});
