
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";

/**
 * Props:
 * - contributor: {
 *     id: string,
 *     name: string,
 *     storyStats: Record<string, number>,
 *     globalStats: Record<string, number>
 *   }
 * - onClose: function to close the popover/dialog
 */
type ContributorStatsPopoverProps = {
  contributor: {
    id: string;
    name: string;
    storyStats: Record<string, number>;
    globalStats: Record<string, number>;
  };
  onClose: () => void;
};

const STATS_LABELS: Record<string, string> = {
  chapters_total: "Chapters (This Story)",
  paragraphs_total: "Paragraphs (This Story)",
  words_total: "Words (This Story)",
  chapters_platform: "Chapters (Platform)",
  paragraphs_platform: "Paragraphs (Platform)",
  words_platform: "Words (Platform)",
  chapters_approved_story: "Approved Chapters (Story)",
  paragraphs_approved_story: "Approved Paragraphs (Story)",
  words_approved_story: "Approved Words (Story)",
  chapters_rejected_story: "Rejected Chapters (Story)",
  paragraphs_rejected_story: "Rejected Paragraphs (Story)",
  words_rejected_story: "Rejected Words (Story)",
  chapters_undecided_story: "Undecided Chapters (Story)",
  paragraphs_undecided_story: "Undecided Paragraphs (Story)",
  words_undecided_story: "Undecided Words (Story)",
  chapters_approved_platform: "Approved Chapters (Platform)",
  paragraphs_approved_platform: "Approved Paragraphs (Platform)",
  words_approved_platform: "Approved Words (Platform)",
  chapters_rejected_platform: "Rejected Chapters (Platform)",
  paragraphs_rejected_platform: "Rejected Paragraphs (Platform)",
  words_rejected_platform: "Rejected Words (Platform)",
  chapters_undecided_platform: "Undecided Chapters (Platform)",
  paragraphs_undecided_platform: "Undecided Paragraphs (Platform)",
  words_undecided_platform: "Undecided Words (Platform)",
};

const groupings = [
  { title: "Story Contributions", keys: ["chapters_total", "paragraphs_total", "words_total"] },
  { title: "Platform Contributions", keys: ["chapters_platform", "paragraphs_platform", "words_platform"] },
  { title: "APPROVED (Story)", keys: ["chapters_approved_story", "paragraphs_approved_story", "words_approved_story"] },
  { title: "REJECTED (Story)", keys: ["chapters_rejected_story", "paragraphs_rejected_story", "words_rejected_story"] },
  { title: "UNDECIDED (Story)", keys: ["chapters_undecided_story", "paragraphs_undecided_story", "words_undecided_story"] },
  { title: "APPROVED (Platform)", keys: ["chapters_approved_platform", "paragraphs_approved_platform", "words_approved_platform"] },
  { title: "REJECTED (Platform)", keys: ["chapters_rejected_platform", "paragraphs_rejected_platform", "words_rejected_platform"] },
  { title: "UNDECIDED (Platform)", keys: ["chapters_undecided_platform", "paragraphs_undecided_platform", "words_undecided_platform"] },
];

const ContributorStatsPopover: React.FC<ContributorStatsPopoverProps> = ({
  contributor,
  onClose,
}) => {
  return (
    <div className="fixed z-40 inset-0 bg-black bg-opacity-30 flex items-center justify-center" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg p-6 w-[340px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5" />
            <span className="font-bold text-lg">{contributor.name}</span>
          </div>
          <button className="text-gray-500 hover:text-red-500" onClick={onClose}>
            &times;
          </button>
        </div>
        {groupings.map(group => (
          <div key={group.title} className="mb-2">
            <div className="font-semibold text-gray-600 text-sm mb-1">{group.title}:</div>
            <div className="flex gap-2 flex-wrap">
              {group.keys.map(key =>
                <Badge key={key} className="px-2 py-1 text-xs font-mono" variant="secondary">
                  {STATS_LABELS[key]}: <span className="ml-1 text-blue-700 font-bold">{contributor.storyStats[key] ?? contributor.globalStats[key] ?? 0}</span>
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContributorStatsPopover;
