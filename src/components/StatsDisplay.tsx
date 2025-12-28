
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
}

const StatsDisplay: React.FC<StatsDisplayProps> = ({ stats }) => {
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
      
      {/* Detailed contributions table is now rendered via ContributionsModule
          in the Profile page. This component focuses purely on high-level
          overview cards. */}
    </div>
  );
};

export default StatsDisplay;
