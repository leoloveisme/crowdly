import React from "react";
import ReactDOM from "react-dom/client";
import Index from "./Index";
import StoryTemplate from "./story template";

const AppRoot: React.FC = () => {
  const path = window.location.pathname;
  if (/^\/story\//.test(path)) {
    // Reuse the same Aloha-based story template editor used on the
    // main index page so the owner gets full inline editing and
    // controls (Clone, Delete, Add another chapter, Branch, etc.).
    return <StoryTemplate />;
  }
  return <Index />;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
