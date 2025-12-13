import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEditableContent } from "@/contexts/EditableContentContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Book, Settings, Eye, HelpCircle, Copy, Plus, 
  Volume, Mic, Users, History, GitBranch, 
  ChevronRight, Image, Share2, ZoomIn,
  Video, AudioLines, ThumbsUp, ThumbsDown, Play,
  MessageCircle
} from "lucide-react";
import EditableText from "@/components/EditableText";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ResponsiveTabsTrigger from "@/components/ResponsiveTabsTrigger";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import ParagraphBranchPopover from "@/components/ParagraphBranchPopover";
import ContributorStatsPopover from "@/components/ContributorStatsPopover";

const StoryforConsumers = () => {
  const { user } = useAuth();
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(["text"]);
  const [activeSection, setActiveSection] = useState<string>("story");
  
  // Changed to store likes/dislikes per chapter and media type
  const [chapterLikes, setChapterLikes] = useState<{[key: string]: number}>({
    chapter1: 35
  });
  const [chapterDislikes, setChapterDislikes] = useState<{[key: string]: number}>({
    chapter1: 6
  });
  
  // Add state for image/presentation likes/dislikes
  const [imageLikes, setImageLikes] = useState<{[key: string]: number}>({
    presentation1: 12
  });
  const [imageDislikes, setImageDislikes] = useState<{[key: string]: number}>({
    presentation1: 3
  });
  
  // Add state for audio likes/dislikes
  const [audioLikes, setAudioLikes] = useState<{[key: string]: number}>({
    audio1: 24
  });
  const [audioDislikes, setAudioDislikes] = useState<{[key: string]: number}>({
    audio1: 2
  });
  
  // Add state for video likes/dislikes
  const [videoLikes, setVideoLikes] = useState<{[key: string]: number}>({
    video1: 43
  });
  const [videoDislikes, setVideoDislikes] = useState<{[key: string]: number}>({
    video1: 5
  });
  
  // Add state for comments
  const [showCommentForm, setShowCommentForm] = useState<{[key: string]: boolean}>({});
  const [comments, setComments] = useState<{[key: string]: Array<{user: string, text: string}>}>({
    chapter1: [],
    presentation1: [],
    audio1: [],
    video1: []
  });
  const [newComment, setNewComment] = useState<string>("");
  const [commentTarget, setCommentTarget] = useState<string>("");
  
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [selectedParagraphForBranch, setSelectedParagraphForBranch] = useState<string | null>(null);
  
  const [showContributorStats, setShowContributorStats] = useState<{ [userId: string]: boolean }>({});
  const [selectedContributor, setSelectedContributor] = useState<any>(null);
  
  const userName = user?.email?.split("@")[0] || "Guest";
  
  // Sample data for tables
  const contributorsData = [
    { id: "user-1", name: "Lola Bridget", words: 5378, paragraphs: 15, chapters: 3 },
    { id: "user-2", name: "James Smith", words: 4892, paragraphs: 12, chapters: 2 },
    { id: "user-3", name: "Maria Garcia", words: 3256, paragraphs: 8, chapters: 1 }
  ];
  
  const revisionsData = [
    { id: 1, timestamp: "2025-05-06 09:23", description: "Title edit - Introduction" },
    { id: 2, timestamp: "2025-05-05 14:45", description: "Content change - Chapter 2" },
    { id: 3, timestamp: "2025-05-04 11:30", description: "New paragraph - Conclusion" }
  ];
  
  const branchesData = [
    { id: 1, title: "Main Storyline", author: "Lola Bridget", chapters: 5 },
    { id: 2, title: "Alternative Ending", author: "James Smith", chapters: 2 },
    { id: 3, title: "Character Background", author: "Maria Garcia", chapters: 3 }
  ];
  
  const chaptersData = [
    { id: 1, number: 1, title: "The Beginning" },
    { id: 2, number: 2, title: "The Conflict" },
    { id: 3, number: 3, title: "The Resolution" }
  ];

  // Function to handle branch creation
  const handleCreateBranch = (paragraphId: string) => {
    setSelectedParagraphForBranch(paragraphId);
    setShowBranchDialog(true);
  };
  
  // Chapter like/dislike handlers
  const handleChapterLike = (id: string) => {
    setChapterLikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  const handleChapterDislike = (id: string) => {
    setChapterDislikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  // Image/presentation like/dislike handlers
  const handleImageLike = (id: string) => {
    setImageLikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  const handleImageDislike = (id: string) => {
    setImageDislikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  // Audio like/dislike handlers
  const handleAudioLike = (id: string) => {
    setAudioLikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  const handleAudioDislike = (id: string) => {
    setAudioDislikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  // Video like/dislike handlers
  const handleVideoLike = (id: string) => {
    setVideoLikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  const handleVideoDislike = (id: string) => {
    setVideoDislikes(prev => ({
      ...prev,
      [id]: (prev[id] || 0) + 1
    }));
  };
  
  // Toggle content type selection
  const toggleContentType = (type: string) => {
    if (selectedContentTypes.includes(type)) {
      setSelectedContentTypes(selectedContentTypes.filter(item => item !== type));
    } else {
      setSelectedContentTypes([...selectedContentTypes, type]);
    }
  };
  
  // Section toggle handler
  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? "" : section);
  };
  
  // Handle showing the comment form
  const handleShowCommentForm = (target: string) => {
    setCommentTarget(target);
    setNewComment("");
    setShowCommentForm(prev => ({
      ...prev,
      [target]: true
    }));
  };
  
  // Handle submitting a new comment
  const handleSubmitComment = () => {
    if (newComment.trim() !== "" && commentTarget) {
      setComments(prev => ({
        ...prev,
        [commentTarget]: [...(prev[commentTarget] || []), {
          user: userName,
          text: newComment.trim()
        }]
      }));
      setNewComment("");
      setShowCommentForm(prev => ({
        ...prev,
        [commentTarget]: false
      }));
    }
  };
  
  // Comments section component
  const CommentsSection = ({ targetId }: { targetId: string }) => {
    const targetComments = comments[targetId] || [];
    
    return (
      <div className="mt-8 pt-4 border-t">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium flex items-center">
            <MessageCircle className="h-5 w-5 mr-2" />
            <EditableText id="comments-title">Comments</EditableText>
          </h3>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleShowCommentForm(targetId)}
          >
            <EditableText id="add-comment-btn">Add Comment</EditableText>
          </Button>
        </div>
        
        {showCommentForm[targetId] ? (
          <div className="mt-4 space-y-3">
            <Textarea
              placeholder="Write your comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[100px]"
            />
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowCommentForm(prev => ({ ...prev, [targetId]: false }))}
              >
                Cancel
              </Button>
              <Button 
                size="sm"
                onClick={handleSubmitComment}
              >
                Submit
              </Button>
            </div>
          </div>
        ) : null}
        
        {targetComments.length > 0 ? (
          <div className="space-y-4 mt-4">
            {targetComments.map((comment, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-3">
                <div className="font-medium text-sm">{comment.user}</div>
                <div className="text-sm mt-1">{comment.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-gray-500 italic">
            <EditableText id="no-comments">No comments yet. Be the first to share your thoughts.</EditableText>
          </div>
        )}
      </div>
    );
  };
  
  // Modify the handleCreateBranch for demo (replace later for Supabase)
  const onCreateParagraphBranch = ({ branchName, paragraphs }: { branchName: string, paragraphs: string[] }) => {
    // For now, just show an alert (insert crud logic here)
    alert(`Branch "${branchName || "(no name)"}" created with ${paragraphs.length} paragraph(s):\n${paragraphs.map((p, i) => `[${i + 1}]: ${p}`).join("\n")}`);
  };
  
  // Function to fetch stats (placeholder, real implementation will fetch/calculate from backend)
  const getContributorStats = (contributorId: string) => {
    // Replace with DB aggregation as soon as available
    // For  now, return dummy numbers.
    return {
      id: contributorId,
      name: contributorsData.find(c => c.id === contributorId)?.name ?? contributorId,
      storyStats: {
        chapters_total: 2,
        paragraphs_total: 8,
        words_total: 2600,
        chapters_approved_story: 1,
        paragraphs_approved_story: 5,
        words_approved_story: 1700,
        chapters_rejected_story: 0,
        paragraphs_rejected_story: 0,
        words_rejected_story: 0,
        chapters_undecided_story: 1,
        paragraphs_undecided_story: 3,
        words_undecided_story: 900,
      },
      globalStats: {
        chapters_platform: 6,
        paragraphs_platform: 24,
        words_platform: 9640,
        chapters_approved_platform: 3,
        paragraphs_approved_platform: 12,
        words_approved_platform: 4800,
        chapters_rejected_platform: 1,
        paragraphs_rejected_platform: 4,
        words_rejected_platform: 1700,
        chapters_undecided_platform: 2,
        paragraphs_undecided_platform: 8,
        words_undecided_platform: 3140,
      }
    };
  };

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {/* Story Header Section */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <Book className="h-6 w-6 mr-2" />
            <h1 className="text-2xl font-bold">
              <EditableText id="story-title">Story of my life</EditableText>
            </h1>
          </div>
          <div>
            <span className="text-gray-600">
              <EditableText id="welcome-message">Welcome {userName}</EditableText>
            </span>
          </div>
        </div>
        
        {/* Content Type Selector with Checkboxes */}
        <div className="flex mb-8 space-x-6 border-b pb-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="text-checkbox" 
              checked={selectedContentTypes.includes("text")} 
              onCheckedChange={() => toggleContentType("text")}
            />
            <Label htmlFor="text-checkbox">
              <EditableText id="content-type-text">text</EditableText>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="images-checkbox" 
              checked={selectedContentTypes.includes("images")} 
              onCheckedChange={() => toggleContentType("images")}
            />
            <Label htmlFor="images-checkbox">
              <EditableText id="content-type-images">images</EditableText>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="audio-checkbox" 
              checked={selectedContentTypes.includes("audio")} 
              onCheckedChange={() => toggleContentType("audio")}
            />
            <Label htmlFor="audio-checkbox">
              <EditableText id="content-type-audio">audio</EditableText>
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="video-checkbox" 
              checked={selectedContentTypes.includes("video")} 
              onCheckedChange={() => toggleContentType("video")}
            />
            <Label htmlFor="video-checkbox">
              <EditableText id="content-type-video">video</EditableText>
            </Label>
          </div>
        </div>
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sidebar - Chapter Navigation */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle>
                    <EditableText id="chapters-title">Chapters</EditableText>
                  </CardTitle>
                  
                  {/* New Settings/Read/Help buttons */}
                  <div className="flex items-center space-x-1">
                    {/* Settings Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem className="flex items-center">
                          <Copy className="mr-2 h-4 w-4" />
                          <EditableText id="clone-menu-item">Clone</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center">
                          <Volume className="mr-2 h-4 w-4" />
                          <EditableText id="generate-audio-menu-item">Generate Audio</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center">
                          <Mic className="mr-2 h-4 w-4" />
                          <EditableText id="record-audio-menu-item">Record Audio</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center">
                          <Video className="mr-2 h-4 w-4" />
                          <EditableText id="record-video-menu-item">Record Video</EditableText>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center">
                          <Video className="mr-2 h-4 w-4" />
                          <EditableText id="generate-video-menu-item">Generate Video</EditableText>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    {/* Read Button */}
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="h-4 w-4" />
                    </Button>
                    
                    {/* Help Button */}
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {chaptersData.map((chapter) => (
                    <div 
                      key={chapter.id} 
                      className="flex justify-between items-center p-2 hover:bg-gray-100 rounded cursor-pointer"
                    >
                      <div className="flex items-center">
                        <span className="text-sm font-medium mr-2">{chapter.number}.</span>
                        <span className="text-sm">{chapter.title}</span>
                      </div>
                      <div className="flex space-x-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Settings className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <Share2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <Button variant="outline" size="sm" className="mt-4 w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  <EditableText id="add-chapter-btn">Add Chapter</EditableText>
                </Button>
              </CardContent>
            </Card>
          </div>
          
          {/* Main Content Area */}
          <div className="lg:col-span-3">
          
            {/* Replace the old tabs with new responsive tabs */}
            <Tabs defaultValue="story" className="w-full">
              <TabsList className="w-full mb-6 border-b overflow-x-auto flex justify-start">
                <ResponsiveTabsTrigger 
                  value="story"
                  icon={<Book className="h-4 w-4" />}
                  text={<EditableText id="story-tab">Story</EditableText>}
                  active={activeSection === 'story' || activeSection === ''}
                  onClick={() => toggleSection('story')}
                />
                <ResponsiveTabsTrigger 
                  value="contributors"
                  icon={<Users className="h-4 w-4" />} 
                  text={<EditableText id="contributors-tab">Contributors</EditableText>}
                  active={activeSection === 'contributors'}
                  onClick={() => toggleSection('contributors')}
                />
                <ResponsiveTabsTrigger 
                  value="revisions"
                  icon={<History className="h-4 w-4" />} 
                  text={<EditableText id="revisions-tab">Revisions</EditableText>}
                  active={activeSection === 'revisions'}
                  onClick={() => toggleSection('revisions')}
                />
                <ResponsiveTabsTrigger 
                  value="branches"
                  icon={<GitBranch className="h-4 w-4" />} 
                  text={<EditableText id="branches-tab">Branches</EditableText>}
                  active={activeSection === 'branches'}
                  onClick={() => toggleSection('branches')}
                />
              </TabsList>
              
              {/* Story Content */}
              {activeSection === 'story' || activeSection === '' ? (
                <div className="space-y-6">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="prose max-w-none">
                        {/* Paragraph 1 */}
                        <div className="mb-6">
                          <div className="group relative">
                            <p className="mb-2">
                              <EditableText id="paragraph-1">
                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam varius, nunc vel tincidunt tincidunt, 
                                nisl nunc aliquam nisi, vel aliquam nisl nunc vel nisi. Nullam varius, nunc vel tincidunt tincidunt, 
                                nisl nunc aliquam nisi, vel aliquam nisl nunc vel nisi.
                              </EditableText>
                            </p>
                            <ParagraphBranchPopover
                              trigger={
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <span className="flex items-center gap-1">
                                    <svg width="16" height="16" stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeWidth="2" d="M6 3v6a6 6 0 006 6h6"></path><path strokeWidth="2" d="M18 21v-6a6 6 0 00-6-6H6"></path></svg>
                                    Create Branch
                                  </span>
                                </Button>
                              }
                              onCreateBranch={onCreateParagraphBranch}
                            />
                          </div>
                        </div>
                        {/* Paragraph 2 */}
                        <div className="mb-6">
                          <div className="group relative">
                            <p className="mb-2">
                              <EditableText id="paragraph-2">
                                Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, 
                                totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae 
                                dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, 
                                sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
                              </EditableText>
                            </p>
                            <ParagraphBranchPopover
                              trigger={
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <span className="flex items-center gap-1">
                                    <svg width="16" height="16" stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeWidth="2" d="M6 3v6a6 6 0 006 6h6"></path><path strokeWidth="2" d="M18 21v-6a6 6 0 00-6-6H6"></path></svg>
                                    Create Branch
                                  </span>
                                </Button>
                              }
                              onCreateBranch={onCreateParagraphBranch}
                            />
                          </div>
                        </div>
                        {/* Paragraph 3 */}
                        <div className="mb-6">
                          <div className="group relative">
                            <p className="mb-2">
                              <EditableText id="paragraph-3">
                                Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, 
                                sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. 
                                Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut 
                                aliquid ex ea commodi consequatur?
                              </EditableText>
                            </p>
                            <ParagraphBranchPopover
                              trigger={
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <span className="flex items-center gap-1">
                                    <svg width="16" height="16" stroke="currentColor" fill="none" viewBox="0 0 24 24"><path strokeWidth="2" d="M6 3v6a6 6 0 006 6h6"></path><path strokeWidth="2" d="M18 21v-6a6 6 0 00-6-6H6"></path></svg>
                                    Create Branch
                                  </span>
                                </Button>
                              }
                              onCreateBranch={onCreateParagraphBranch}
                            />
                          </div>
                        </div>
                        
                        {/* Image Player Container */}
                        {selectedContentTypes.includes('images') && (
                          <div className="my-8 border p-4 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-lg font-medium flex items-center">
                                <Image className="h-5 w-5 mr-2" />
                                <EditableText id="presentation-title">Presentation / Cartoon</EditableText>
                              </h3>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">
                                  <ZoomIn className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Share2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="bg-gray-200 h-64 flex flex-col items-center justify-center rounded">
                              <div className="h-48 w-48 bg-gray-300 rounded flex items-center justify-center mb-4">
                                <Play className="h-12 w-12 text-gray-500" />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button variant="outline" size="sm">
                                  <EditableText id="prev-image">Previous</EditableText>
                                </Button>
                                <span className="text-sm">1 / 5</span>
                                <Button variant="outline" size="sm">
                                  <EditableText id="next-image">Next</EditableText>
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">
                              <EditableText id="image-caption">Slide caption: Describe what is shown in the presentation slide.</EditableText>
                            </p>
                            
                            {/* Add like/dislike buttons to the image container */}
                            <div className="mt-6 pt-4 border-t flex items-center space-x-2">
                              <button 
                                onClick={() => handleImageLike('presentation1')} 
                                className="flex items-center text-sm text-gray-500 hover:text-blue-500"
                              >
                                <ThumbsUp className="h-5 w-5 mr-1" />
                                <span>{imageLikes.presentation1 || 0}</span>
                              </button>
                              <button 
                                onClick={() => handleImageDislike('presentation1')} 
                                className="flex items-center text-sm text-gray-500 hover:text-red-500"
                              >
                                <ThumbsDown className="h-5 w-5 mr-1" />
                                <span>{imageDislikes.presentation1 || 0}</span>
                              </button>
                            </div>
                            
                            {/* Add Comments section for presentation */}
                            <CommentsSection targetId="presentation1" />
                          </div>
                        )}
                        
                        {/* Audio Player Container */}
                        {selectedContentTypes.includes('audio') && (
                          <div className="my-8 border p-4 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-lg font-medium flex items-center">
                                <AudioLines className="h-5 w-5 mr-2" />
                                <EditableText id="audio-title">Audio Player</EditableText>
                              </h3>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">
                                  <Share2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="bg-gray-100 p-4 rounded">
                              <div className="flex items-center space-x-2 mb-3">
                                <Button variant="outline" size="icon" className="h-10 w-10 rounded-full flex items-center justify-center">
                                  <Play className="h-6 w-6" />
                                </Button>
                                <div className="w-full">
                                  <div className="bg-gray-300 h-2 rounded-full w-full overflow-hidden">
                                    <div className="bg-primary h-full w-1/3 rounded-full"></div>
                                  </div>
                                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                                    <span>1:23</span>
                                    <span>3:45</span>
                                  </div>
                                </div>
                                <Button variant="ghost" size="sm">
                                  <Volume className="h-5 w-5" />
                                </Button>
                              </div>
                              <p className="text-sm text-gray-500 italic">
                                <EditableText id="audio-description">Audio description: Narrative of Chapter 1, read by the author.</EditableText>
                              </p>
                            </div>
                            
                            {/* Add like/dislike buttons to the audio container */}
                            <div className="mt-6 pt-4 border-t flex items-center space-x-2">
                              <button 
                                onClick={() => handleAudioLike('audio1')} 
                                className="flex items-center text-sm text-gray-500 hover:text-blue-500"
                              >
                                <ThumbsUp className="h-5 w-5 mr-1" />
                                <span>{audioLikes.audio1 || 0}</span>
                              </button>
                              <button 
                                onClick={() => handleAudioDislike('audio1')} 
                                className="flex items-center text-sm text-gray-500 hover:text-red-500"
                              >
                                <ThumbsDown className="h-5 w-5 mr-1" />
                                <span>{audioDislikes.audio1 || 0}</span>
                              </button>
                            </div>
                            
                            {/* Add Comments section for audio */}
                            <CommentsSection targetId="audio1" />
                          </div>
                        )}
                        
                        {/* Video Player Container */}
                        {selectedContentTypes.includes('video') && (
                          <div className="my-8 border p-4 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-lg font-medium flex items-center">
                                <Video className="h-5 w-5 mr-2" />
                                <EditableText id="video-title">Video Player</EditableText>
                              </h3>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">
                                  <ZoomIn className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Share2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="bg-gray-800 h-72 rounded flex flex-col items-center justify-center">
                              <Play className="h-16 w-16 text-white opacity-70 hover:opacity-100 cursor-pointer" />
                              
                              <div className="absolute bottom-4 w-11/12 opacity-0 hover:opacity-100 transition-opacity">
                                <div className="bg-gray-900 bg-opacity-70 p-2 rounded">
                                  <div className="bg-gray-300 h-2 rounded-full w-full overflow-hidden">
                                    <div className="bg-primary h-full w-1/4 rounded-full"></div>
                                  </div>
                                  <div className="flex justify-between items-center mt-1">
                                    <div className="flex items-center space-x-2">
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white">
                                        <Play className="h-4 w-4" />
                                      </Button>
                                      <span className="text-xs text-gray-200">0:35 / 2:18</span>
                                    </div>
                                    <div className="flex items-center">
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white">
                                        <Volume className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">
                              <EditableText id="video-caption">Video caption: Visual interpretation of Chapter 1 - The Beginning.</EditableText>
                            </p>
                            
                            {/* Add like/dislike buttons to the video container */}
                            <div className="mt-6 pt-4 border-t flex items-center space-x-2">
                              <button 
                                onClick={() => handleVideoLike('video1')} 
                                className="flex items-center text-sm text-gray-500 hover:text-blue-500"
                              >
                                <ThumbsUp className="h-5 w-5 mr-1" />
                                <span>{videoLikes.video1 || 0}</span>
                              </button>
                              <button 
                                onClick={() => handleVideoDislike('video1')} 
                                className="flex items-center text-sm text-gray-500 hover:text-red-500"
                              >
                                <ThumbsDown className="h-5 w-5 mr-1" />
                                <span>{videoDislikes.video1 || 0}</span>
                              </button>
                            </div>
                            
                            {/* Add Comments section for video */}
                            <CommentsSection targetId="video1" />
                          </div>
                        )}
                        
                        {/* Add like/dislike buttons for the chapter */}
                        <div className="mt-8 pt-4 border-t flex items-center space-x-2">
                          <button 
                            onClick={() => handleChapterLike('chapter1')} 
                            className="flex items-center text-sm text-gray-500 hover:text-blue-500"
                          >
                            <ThumbsUp className="h-5 w-5 mr-1" />
                            <span>{chapterLikes.chapter1 || 0}</span>
                          </button>
                          <button 
                            onClick={() => handleChapterDislike('chapter1')} 
                            className="flex items-center text-sm text-gray-500 hover:text-red-500"
                          >
                            <ThumbsDown className="h-5 w-5 mr-1" />
                            <span>{chapterDislikes.chapter1 || 0}</span>
                          </button>
                        </div>
                        
                        {/* Add Comments section for chapter */}
                        <CommentsSection targetId="chapter1" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Dialog for creating a new branch */}
                  <Dialog open={showBranchDialog} onOpenChange={setShowBranchDialog}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create a New Branch</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="branch-name">Branch Name</Label>
                          <Input id="branch-name" placeholder="Enter a name for your branch" />
                        </div>
                        <div>
                          <Label htmlFor="branch-description">Description</Label>
                          <Textarea id="branch-description" placeholder="Briefly describe your branch" />
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" onClick={() => setShowBranchDialog(false)}>
                            Cancel
                          </Button>
                          <Button>
                            Create Branch
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}
              
              {/* Contributors Content */}
              {activeSection === 'contributors' && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <EditableText id="contributors-title">Contributors</EditableText>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <EditableText id="contributor-name">Name</EditableText>
                          </TableHead>
                          <TableHead>
                            <EditableText id="words-contributed">Words</EditableText>
                          </TableHead>
                          <TableHead>
                            <EditableText id="paragraphs-contributed">Paragraphs</EditableText>
                          </TableHead>
                          <TableHead>
                            <EditableText id="chapters-contributed">Chapters</EditableText>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contributorsData.map((contributor) => (
                          <TableRow key={contributor.id}>
                            <TableCell className="font-medium">
                              <button
                                className="text-blue-800 underline hover:text-blue-600"
                                onClick={() => {
                                  setSelectedContributor(getContributorStats(contributor.id));
                                  setShowContributorStats(prev => ({
                                    ...prev,
                                    [contributor.id]: true
                                  }));
                                }}
                              >
                                {contributor.name}
                              </button>
                            </TableCell>
                            <TableCell>{contributor.words}</TableCell>
                            <TableCell>{contributor.paragraphs}</TableCell>
                            <TableCell>{contributor.chapters}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
              
              {/* Revisions Content */}
              {activeSection === 'revisions' && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <EditableText id="revisions-title">Revision History</EditableText>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {revisionsData.map((revision) => (
                        <div key={revision.id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg">
                          <div>
                            <div className="font-medium">{revision.description}</div>
                            <div className="text-gray-500 text-sm">{revision.timestamp}</div>
                          </div>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            <EditableText id="view-revision-btn">View</EditableText>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Branches Content */}
              {activeSection === 'branches' && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <EditableText id="branches-title">Story Branches</EditableText>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {branchesData.map((branch) => (
                        <div key={branch.id} className="flex justify-between items-center p-3 border rounded-lg">
                          <div>
                            <div className="font-medium">{branch.title}</div>
                            <div className="text-gray-500 text-sm">By {branch.author} · {branch.chapters} chapters</div>
                          </div>
                          <Button variant="outline" size="sm" className="flex items-center">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    {/* Please DO NOT add "Add New Branch" button here !!!! */}
                  </CardContent>
                </Card>
              )}
            </Tabs>
            {/* Contributor stats popover */}
            {selectedContributor && showContributorStats[selectedContributor.id] && (
              <ContributorStatsPopover
                contributor={selectedContributor}
                onClose={() => {
                  setShowContributorStats(prev => ({
                    ...prev,
                    [selectedContributor.id]: false
                  }));
                  setSelectedContributor(null);
                }}
              />
            )}
          </div>
        </div>
      </main>

      <Button variant="outline" size="sm" className="mt-4 w-full">
        <EditableText id="add-chapter-btn">Next Chapter</EditableText>
      </Button>
      
      <CrowdlyFooter />
    </div>
  );
};

export default StoryforConsumers;
