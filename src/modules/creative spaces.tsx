import React from "react";
import { Link } from "react-router-dom";

export type CreativeSpace = {
  id: string;
  name: string;
  description?: string | null;
  path?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  // Backend metadata
  visibility?: "public" | "private" | "friends" | "selected" | null;
  published?: boolean | null;
  default_item_visibility?: string | null;
  last_synced_at?: string | null;
  sync_state?: string | null;
};

interface CreativeSpacesProps {
  spaces: CreativeSpace[];
  isLoading?: boolean;
  onCreate?: () => void;
  onRename?: (space: CreativeSpace) => void;
  onDelete?: (space: CreativeSpace) => void;
  onClone?: (space: CreativeSpace) => void;
  onToggleVisibility?: (space: CreativeSpace, nextVisibility: CreativeSpace["visibility"]) => void;
  onTogglePublished?: (space: CreativeSpace, nextPublished: boolean) => void;
  onShowStats?: (space: CreativeSpace) => void;
}

/**
 * CreativeSpacesModule
 *
 * This module is the web counterpart of the "project space" concept in the
 * desktop editor: a user can have multiple creative spaces, each of which can
 * contain folders, sub-folders and files. For now it is a purely presentational
 * component that lists the provided spaces and shows an empty state when the
 * list is empty.
 *
 * Later, this module can be wired to real data from the backend and to
 * synchronisation logic with the desktop app's .crowdly directory.
 */
const CreativeSpacesModule: React.FC<CreativeSpacesProps> = ({
  spaces,
  isLoading,
  onCreate,
  onRename,
  onDelete,
  onClone,
  onToggleVisibility,
  onTogglePublished,
  onShowStats,
}) => {
  if (isLoading) {
    return (
      <div className="border rounded-lg bg-white p-4 text-sm text-gray-500">
        Loading creative spaces...
      </div>
    );
  }

  if (!spaces || spaces.length === 0) {
    return (
      <div className="border rounded-lg bg-white p-4 text-sm text-gray-500 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">Space(s)</span>
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="px-2 py-1 text-xs rounded border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              + New creative space
            </button>
          )}
        </div>
        <div className="mt-1 text-gray-500 text-xs">
          No active spaces here yet.
        </div>
      </div>
    );
  }

  const renderVisibility = (space: CreativeSpace) => {
    const vis = space.visibility || "private";
    const published = Boolean(space.published);
    const label = published ? `${vis} · published` : `${vis} · unpublished`;
    return <span className="text-[11px] text-gray-500 whitespace-nowrap">{label}</span>;
  };

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Space(s)</h3>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="px-2 py-1 text-xs rounded border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            + New creative space
          </button>
        )}
      </div>
      <ul className="divide-y text-sm">
        {spaces.map((space) => (
          <li key={space.id} className="py-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  <Link
                    to={`/creative_space/${space.id}`}
                    className="hover:underline text-purple-700"
                  >
                    {space.name}
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                  <span className="truncate">space_id: {space.id}</span>
                  {renderVisibility(space)}
                  {space.last_synced_at && (
                    <span className="truncate">
                      last sync: {new Date(space.last_synced_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                <Link
                  to={`/creative_space/${space.id}`}
                  className="px-1 py-0.5 rounded hover:bg-purple-50 text-purple-700"
                >
                  Open
                </Link>
                {onShowStats && (
                  <button
                    type="button"
                    onClick={() => onShowStats(space)}
                    className="px-1 py-0.5 rounded hover:bg-gray-100"
                  >
                    Stats
                  </button>
                )}
                {onToggleVisibility && (
                  <button
                    type="button"
                    onClick={() =>
                      onToggleVisibility(
                        space,
                        (space.visibility === "private" ? "public" : "private") as CreativeSpace["visibility"],
                      )
                    }
                    className="px-1 py-0.5 rounded hover:bg-gray-100"
                  >
                    {space.visibility === "private" ? "Make public" : "Make private"}
                  </button>
                )}
                {onTogglePublished && (
                  <button
                    type="button"
                    onClick={() => onTogglePublished(space, !Boolean(space.published))}
                    className="px-1 py-0.5 rounded hover:bg-gray-100"
                  >
                    {space.published ? "Unpublish" : "Publish"}
                  </button>
                )}
                {onRename && (
                  <button
                    type="button"
                    onClick={() => onRename(space)}
                    className="px-1 py-0.5 rounded hover:bg-gray-100"
                  >
                    Rename
                  </button>
                )}
                {onClone && (
                  <button
                    type="button"
                    onClick={() => onClone(space)}
                    className="px-1 py-0.5 rounded hover:bg-gray-100"
                  >
                    Clone
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(space)}
                    className="px-1 py-0.5 rounded hover:bg-red-50 text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {space.description && (
              <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                {space.description}
              </div>
            )}
            {space.path && (
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                {space.path}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CreativeSpacesModule;
