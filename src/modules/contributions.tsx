import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EditableText from "@/components/EditableText";

// Generic "Contributions" container module.
//
// This is designed to mirror the contributions table on the Profile page,
// but with richer fields so it can be reused on Story pages (e.g. a
// future "Contributions" tab). The module itself is presentational and
// expects the caller to provide the data; it does not fetch from the
// backend.

export type ContributionStatus = "approved" | "denied" | "undecided";

export interface ContributionRow {
  id: string | number;
  story_title: string;
  chapter_title: string;
  paragraph: string;
  user: string;
  date: string; // formatted date/time string for display
  words: number;
  likes: number;
  dislikes: number;
  comments: number;
  status: ContributionStatus;
}

export interface ContributionsModuleProps {
  contributions: ContributionRow[];
  currentFilter: "total" | ContributionStatus;
  onFilterChange: (filter: "total" | ContributionStatus) => void;
  className?: string;
  titleId?: string; // EditableText id for the main heading
}

const ContributionsModule: React.FC<ContributionsModuleProps> = ({
  contributions,
  currentFilter,
  onFilterChange,
  className,
  titleId = "contributions-module-heading",
}) => {
  const filtered =
    currentFilter === "total"
      ? contributions
      : contributions.filter((row) => row.status === currentFilter);

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold mb-4">
        <EditableText id={titleId}>Contributions</EditableText>
      </h3>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex space-x-4 text-sm">
          <button
            className={`${currentFilter === "total" ? "text-blue-500 font-medium" : "text-gray-500"}`}
            onClick={() => onFilterChange("total")}
          >
            <EditableText id="filter-total">total</EditableText>
          </button>
          <button
            className={`${currentFilter === "approved" ? "text-blue-500 font-medium" : "text-gray-500"}`}
            onClick={() => onFilterChange("approved")}
          >
            <EditableText id="filter-approved">approved</EditableText>
          </button>
          <button
            className={`${currentFilter === "denied" ? "text-blue-500 font-medium" : "text-gray-500"}`}
            onClick={() => onFilterChange("denied")}
          >
            <EditableText id="filter-denied">denied</EditableText>
          </button>
          <button
            className={`${currentFilter === "undecided" ? "text-blue-500 font-medium" : "text-gray-500"}`}
            onClick={() => onFilterChange("undecided")}
          >
            <EditableText id="filter-undecided">undecided</EditableText>
          </button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <EditableText id="contrib-story-title-heading">Story title</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="contrib-chapter-title-heading">Chapter title</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="contrib-paragraph-heading">Paragraph</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="contrib-user-heading">User</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="contrib-date-heading">Date</EditableText>
            </TableHead>
            <TableHead className="text-right">
              <EditableText id="contrib-words-heading">Words</EditableText>
            </TableHead>
            <TableHead className="text-right">
              <EditableText id="contrib-likes-heading">Likes</EditableText>
            </TableHead>
            <TableHead className="text-right">
              <EditableText id="contrib-dislikes-heading">Dislikes</EditableText>
            </TableHead>
            <TableHead className="text-right">
              <EditableText id="contrib-comments-heading">Comments</EditableText>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap max-w-[200px] truncate" title={row.story_title}>
                {row.story_title}
              </TableCell>
              <TableCell className="whitespace-nowrap max-w-[200px] truncate" title={row.chapter_title}>
                {row.chapter_title}
              </TableCell>
              <TableCell className="max-w-[260px] truncate" title={row.paragraph}>
                {row.paragraph}
              </TableCell>
              <TableCell className="whitespace-nowrap max-w-[160px] truncate" title={row.user}>
                {row.user}
              </TableCell>
              <TableCell className="whitespace-nowrap">{row.date}</TableCell>
              <TableCell className="text-right">{row.words}</TableCell>
              <TableCell className="text-right">{row.likes}</TableCell>
              <TableCell className="text-right">{row.dislikes}</TableCell>
              <TableCell className="text-right">{row.comments}</TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-sm text-gray-500 py-4">
                <EditableText id="contrib-empty-state">No contributions yet.</EditableText>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ContributionsModule;
