import React, { useState } from "react";
import EditableText from "@/components/EditableText";
import CompareRevisionsContainer from "@/modules/compare revisions";
import type { ScreenplayScene } from "@/lib/screenplayApi";

/** Revisions tab: compare revisions of the whole screenplay or one scene. */
const ScreenplayRevisions: React.FC<{ screenplayId: string; scenes: ScreenplayScene[] }> = ({
  screenplayId,
  scenes,
}) => {
  const [sceneId, setSceneId] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label htmlFor="rev-scene-select" className="text-sm font-medium">
          <EditableText id="screenplay-rev-filter">Filter by scene:</EditableText>
        </label>
        <select
          id="rev-scene-select"
          value={sceneId}
          onChange={(e) => setSceneId(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All scenes</option>
          {scenes.map((s, i) => (
            <option key={s.scene_id} value={s.scene_id}>
              {i + 1}. {s.slugline}
            </option>
          ))}
        </select>
      </div>
      <CompareRevisionsContainer screenplayTitleId={screenplayId} sceneId={sceneId || undefined} contentType="screenplay" />
    </div>
  );
};

export default ScreenplayRevisions;
