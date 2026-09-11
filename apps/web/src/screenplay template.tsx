import React from "react";

// This file is kept for backward-compatibility but the actual
// screenplay editing experience now lives in `screenplay editor.tsx`
// and is mounted based on the /screenplay/:id route from main.tsx.
// We keep a simple placeholder here so any legacy imports still work
// without breaking the build.

const ScreenplayTemplate: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <p
        style={{
          fontSize: 14,
          color: "#444",
        }}
      >
        Please open a screenplay via
        {" "}
        <code>http://localhost:5173/screenplay/&lt;id&gt;</code>
        {" "}
        or using the "Go" box on the landing page.
      </p>
    </div>
  );
};

export default ScreenplayTemplate;
