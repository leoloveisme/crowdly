import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, User, X } from "lucide-react";
import EditableText from "@/components/EditableText";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/apiBase";
import {
  addWorkCredit,
  grantWorkAccess,
  listWorkCollaborators,
  listWorkContributors,
  personName,
  removeWorkCredit,
  revokeWorkAccess,
  searchUsers,
  transferWorkOwnership,
  type UserSearchResult,
  type WorkKind,
  type WorkPerson,
} from "@/lib/workApi";

interface Props {
  kind: WorkKind;
  workId: string;
  /** Called after ownership moved to someone else (the page reloads access). */
  onOwnershipTransferred: () => void;
}

const searchResultName = (u: UserSearchResult) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;

/** Debounced user search box; calls onPick with the chosen user. */
const UserPicker: React.FC<{ placeholder: string; onPick: (user: UserSearchResult) => void }> = ({
  placeholder,
  onPick,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchUsers(query.trim()));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded px-2 py-1 text-xs"
      />
      {searching && <Loader2 className="absolute right-2 top-1.5 h-3 w-3 animate-spin text-gray-400" />}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded border bg-white shadow">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(u);
                  setQuery("");
                  setResults([]);
                }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-gray-50"
              >
                {searchResultName(u)} <span className="text-gray-400">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Chip: React.FC<{ person: WorkPerson; onRemove?: () => void; tone: string }> = ({ person, onRemove, tone }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${tone}`}>
    <User className="h-3 w-3" />
    {personName(person)}
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label="Remove" className="hover:text-red-600">
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);

/**
 * Owner-only people management for a screenplay or comic, the same blocks
 * the story settings sheet has: ownership transfer, authors, co-authors and
 * the team (who may edit directly).
 */
const WorkPeopleSection: React.FC<Props> = ({ kind, workId, onOwnershipTransferred }) => {
  const p = kind;
  const [credits, setCredits] = useState<WorkPerson[]>([]);
  const [team, setTeam] = useState<WorkPerson[]>([]);
  const [transferTarget, setTransferTarget] = useState<UserSearchResult | null>(null);
  const [teamEmail, setTeamEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) =>
    toast({ title: "Collaborators", description: errorMessage(err) ?? "Request failed", variant: "destructive" });

  const load = useCallback(async () => {
    try {
      const [creditRows, people] = await Promise.all([
        listWorkCollaborators(kind, workId),
        listWorkContributors(kind, workId),
      ]);
      setCredits(creditRows);
      setTeam(people.filter((person) => person.role === "contributor" || person.role === "owner"));
    } catch {
      setCredits([]);
      setTeam([]);
    }
  }, [kind, workId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const creditBlock = (role: "author" | "coauthor") => (
    <div className="border rounded-md p-3 space-y-2">
      <div className="text-xs font-semibold text-gray-600">
        {role === "author" ? (
          <EditableText id={`${p}-authors-label`}>Authors</EditableText>
        ) : (
          <EditableText id={`${p}-coauthors-label`}>Co-authors</EditableText>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {credits
          .filter((c) => c.role === role)
          .map((c) => (
            <Chip
              key={c.user_id}
              person={c}
              tone={role === "author" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}
              onRemove={() => run(() => removeWorkCredit(kind, workId, role, c.user_id))}
            />
          ))}
      </div>
      <UserPicker
        placeholder={role === "author" ? "Add an author…" : "Add a co-author…"}
        onPick={(u) => run(() => addWorkCredit(kind, workId, role, u.id))}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="border rounded-md p-3 bg-gray-50 space-y-2">
        <div className="text-xs font-semibold text-gray-600">
          <EditableText id={`${p}-transfer-ownership-label`}>Transfer ownership to</EditableText>
        </div>
        {transferTarget ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-800">
              <User className="h-3 w-3" />
              {searchResultName(transferTarget)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`Transfer ownership to ${searchResultName(transferTarget)}? You will stay on the team.`)) {
                  return;
                }
                run(async () => {
                  await transferWorkOwnership(kind, workId, transferTarget.id);
                  setTransferTarget(null);
                  onOwnershipTransferred();
                });
              }}
              className="px-2 py-1 rounded bg-orange-500 text-white text-xs hover:bg-orange-600 disabled:opacity-60"
            >
              <EditableText id={`${p}-transfer-btn`}>Transfer</EditableText>
            </button>
            <button type="button" onClick={() => setTransferTarget(null)} className="text-xs text-gray-500 hover:underline">
              <EditableText id={`${p}-transfer-cancel`}>Cancel</EditableText>
            </button>
          </div>
        ) : (
          <UserPicker placeholder="Search for the new owner…" onPick={setTransferTarget} />
        )}
      </div>

      {creditBlock("author")}
      {creditBlock("coauthor")}

      <div className="border rounded-md p-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600">
          <EditableText id={`${p}-team-label`}>Team (can edit directly)</EditableText>
        </div>
        <div className="flex flex-wrap gap-1">
          {team.map((person) => (
            <Chip
              key={person.user_id}
              person={person}
              tone="bg-green-100 text-green-800"
              onRemove={
                person.role === "contributor"
                  ? () => run(() => revokeWorkAccess(kind, workId, person.user_id))
                  : undefined
              }
            />
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const email = teamEmail.trim();
            if (!email) return;
            run(async () => {
              await grantWorkAccess(kind, workId, { email });
              setTeamEmail("");
            });
          }}
        >
          <input
            type="email"
            value={teamEmail}
            onChange={(e) => setTeamEmail(e.target.value)}
            placeholder="Invite by email"
            className="flex-1 border rounded px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={busy || !teamEmail.trim()}
            className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-60"
          >
            <EditableText id={`${p}-team-invite-btn`}>Invite</EditableText>
          </button>
        </form>
      </div>
    </div>
  );
};

export default WorkPeopleSection;
