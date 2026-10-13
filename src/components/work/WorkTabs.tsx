import React, { useEffect, useState } from "react";
import { User } from "lucide-react";
import EditableText from "@/components/EditableText";
import { listWorkContributors, personName, type WorkKind, type WorkPerson } from "@/lib/workApi";

export interface WorkTab<K extends string> {
  key: K;
  label: React.ReactNode;
  icon: React.ReactNode;
}

/** The story page's tab bar (Story | Contributions | Contributors | …) for other kinds. */
export function WorkTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: WorkTab<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <nav className="mb-6">
      <div className="flex flex-row items-center gap-2 border rounded-lg bg-gray-50 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex items-center px-3 py-2 rounded transition font-medium text-sm gap-2 ${
              active === tab.key
                ? "bg-white border border-blue-300 text-blue-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

const ROLE_LABELS: Record<string, { id: string; text: string }> = {
  creator: { id: "role-creator", text: "Creator" },
  owner: { id: "role-owner", text: "Owner" },
  contributor: { id: "role-contributor", text: "Contributor" },
  author: { id: "role-author", text: "Author" },
  coauthor: { id: "role-coauthor", text: "Co-author" },
};

/** Contributors tab: everyone who created, co-wrote or edited the work. */
export const WorkContributorsList: React.FC<{ kind: WorkKind; workId: string }> = ({ kind, workId }) => {
  const [people, setPeople] = useState<WorkPerson[] | null>(null);

  useEffect(() => {
    listWorkContributors(kind, workId)
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [kind, workId]);

  if (people === null) {
    return <EditableText id={`${kind}-contributors-loading`} as="p" className="text-sm text-gray-500">Loading contributors...</EditableText>;
  }
  if (people.length === 0) {
    return <EditableText id={`${kind}-contributors-empty`} as="p" className="text-sm text-gray-500">No contributors yet.</EditableText>;
  }
  return (
    <ul className="divide-y rounded-lg border bg-white">
      {people.map((person) => {
        const role = ROLE_LABELS[person.role] ?? { id: `role-${person.role}`, text: person.role };
        return (
          <li key={person.user_id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <User className="h-4 w-4 text-gray-400" />
            <span className="flex-1">{personName(person)}</span>
            <span className="text-xs rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
              <EditableText id={`${kind}-${role.id}`}>{role.text}</EditableText>
            </span>
          </li>
        );
      })}
    </ul>
  );
};
