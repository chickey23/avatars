import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerDefaultRunners } from "./services/backgroundAgents";
import { hydrateWorldMetadataFromDisk } from "./services/worldMetadata/store";

void hydrateWorldMetadataFromDisk().then(() => {
  registerDefaultRunners();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
