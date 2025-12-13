
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { FileText, Image, AudioLines, Video, Book, Star, Users, Eye } from "lucide-react";
import EditableText from "@/components/EditableText";

interface StatsDisplayProps {
  stats: {
    stories: number;
    views: number;
    likes: number;
    contributions: number;
  };
  contributions: Array<{
    id: number;
    storyTitle: string;
    chapterName: string;
    date: string;
    words: number;
    likes: number;
    status: string;
  }>;
  onFilterChange: (filter: string) => void;
  currentFilter: string;
}

const StatsDisplay: React.FC<StatsDisplayProps> = ({ 
  stats, 
  contributions, 
  onFilterChange,
  currentFilter
}) => {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">
        <EditableText id="stats-overview">Stats Overview</EditableText>
      </h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Book className="h-8 w-8 mx-auto text-purple-600" />
            <p className="text-2xl font-bold mt-2">{stats.stories}</p>
            <p className="text-sm text-muted-foreground">
              <EditableText id="stories-count">Stories</EditableText>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Eye className="h-8 w-8 mx-auto text-blue-500" />
            <p className="text-2xl font-bold mt-2">{stats.views}</p>
            <p className="text-sm text-muted-foreground">
              <EditableText id="views-count">Views</EditableText>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Star className="h-8 w-8 mx-auto text-yellow-500" />
            <p className="text-2xl font-bold mt-2">{stats.likes}</p>
            <p className="text-sm text-muted-foreground">
              <EditableText id="likes-count">Likes</EditableText>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-8 w-8 mx-auto text-green-500" />
            <p className="text-2xl font-bold mt-2">{stats.contributions}</p>
            <p className="text-sm text-muted-foreground">
              <EditableText id="contributions-count">Contributions</EditableText>
            </p>
          </CardContent>
        </Card>
      </div>
      
      <h3 className="text-lg font-semibold mt-8">
        <EditableText id="contributions-heading">Contributions</EditableText>
      </h3>
      
      <div className="flex items-center gap-4 mb-4">
        <div className="flex space-x-4 text-sm">
          <button 
            className={`${currentFilter === 'total' ? 'text-blue-500 font-medium' : 'text-gray-500'}`}
            onClick={() => onFilterChange('total')}
          >
            <EditableText id="filter-total">total</EditableText>
          </button>
          <button 
            className={`${currentFilter === 'approved' ? 'text-blue-500 font-medium' : 'text-gray-500'}`}
            onClick={() => onFilterChange('approved')}
          >
            <EditableText id="filter-approved">approved</EditableText>
          </button>
          <button 
            className={`${currentFilter === 'denied' ? 'text-blue-500 font-medium' : 'text-gray-500'}`}
            onClick={() => onFilterChange('denied')}
          >
            <EditableText id="filter-denied">denied</EditableText>
          </button>
          <button 
            className={`${currentFilter === 'undecided' ? 'text-blue-500 font-medium' : 'text-gray-500'}`}
            onClick={() => onFilterChange('undecided')}
          >
            <EditableText id="filter-undecided">undecided</EditableText>
          </button>
        </div>
      </div>
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <EditableText id="story-title-heading">Story Title</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="chapter-heading">Chapter</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="date-heading">Date</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="words-heading">Words</EditableText>
            </TableHead>
            <TableHead>
              <EditableText id="likes-heading">Likes</EditableText>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contributions.map(contribution => (
            <TableRow key={contribution.id}>
              <TableCell>{contribution.storyTitle}</TableCell>
              <TableCell>{contribution.chapterName}</TableCell>
              <TableCell>{contribution.date}</TableCell>
              <TableCell>{contribution.words}</TableCell>
              <TableCell>{contribution.likes}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default StatsDisplay;
