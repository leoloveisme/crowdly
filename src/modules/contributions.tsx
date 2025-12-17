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
}

export interface ContributionsModuleProps {
  contributions: ContributionRow[];
  className?: string;
  titleId?: string; // EditableText id for the main heading
}

const ContributionsModule: React.FC<ContributionsModuleProps> = ({
  contributions,
  className,
  titleId = "contributions-module-heading",
}) => {
  return (
    <div className={className}>
      <h3 className="text-lg font-semibold mb-4">
        <EditableText id={titleId}>Contributions</EditableText>
      </h3>

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
          {contributions.map((row) => (
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
          {contributions.length === 0 && (
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
