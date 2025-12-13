import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import EditableText from "@/components/EditableText";
import ResponsiveTabsTrigger from "@/components/ResponsiveTabsTrigger";
import { 
  MessageSquare, 
  Users, 
  Calendar, 
  Coffee, 
  BookOpen, 
  Video, 
  Mic, 
  Image,
  Globe,
  Lightbulb,
  FileText
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Lounge = () => {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = React.useState<string>("discussions");
  const [language, setLanguage] = React.useState<string>("en");
  
  // Sample data for discussions, events, etc.
  const discussions = [
    {
      id: 1,
      title: "Character development in modern storytelling",
      author: "Jane Writer",
      date: "May 12, 2025",
      replies: 24,
      lastActivity: "2 hours ago"
    },
    {
      id: 2,
      title: "Incorporating visual elements in narrative fiction",
      author: "Michael Creator",
      date: "May 10, 2025",
      replies: 15,
      lastActivity: "1 day ago"
    },
    {
      id: 3,
      title: "Audio narration techniques for engaging listeners",
      author: "Sarah Voice",
      date: "May 8, 2025",
      replies: 31,
      lastActivity: "3 days ago"
    }
  ];
  
  const events = [
    {
      id: 1,
      title: "Monthly Writers Workshop",
      date: "May 20, 2025",
      time: "7:00 PM - 9:00 PM",
      location: "Virtual",
      attendees: 45
    },
    {
      id: 2,
      title: "Storytelling Festival",
      date: "June 5-7, 2025",
      time: "All day",
      location: "City Convention Center",
      attendees: 210
    },
    {
      id: 3,
      title: "Book Club: 'The Creative Process'",
      date: "May 25, 2025",
      time: "5:30 PM - 7:00 PM",
      location: "Hybrid (In-person & Virtual)",
      attendees: 28
    }
  ];
  
  const resources = [
    {
      id: 1,
      title: "Guide to Effective Character Building",
      type: "PDF",
      author: "Professor Emma Wright",
      downloads: 145
    },
    {
      id: 2,
      title: "Audio Narration Equipment Recommendations",
      type: "Article",
      author: "Sound Engineer Tom",
      downloads: 87
    },
    {
      id: 3,
      title: "Visual Storytelling Techniques",
      type: "Video Course",
      author: "Creative Director Patricia",
      downloads: 203
    }
  ];
  
  // Toggle section handler
  const toggleSection = (section: string) => {
    setActiveSection(section === activeSection ? "" : section);
  };

  // Language labels
  const languageLabels: Record<string, Record<string, string>> = {
    en: {
      welcomeText: "Welcome",
      loungeTitle: "The Creators' Lounge",
      loungeDescription: "A relaxed space for creators to connect, share ideas, participate in events, and access valuable resources.",
      discussionsTab: "Discussions",
      eventsTab: "Events",
      resourcesTab: "Resources",
      creatorsTab: "Creators",
      languageSelector: "Language"
    },
    es: {
      welcomeText: "Bienvenido",
      loungeTitle: "El Salón de los Creadores",
      loungeDescription: "Un espacio relajado para que los creadores se conecten, compartan ideas, participen en eventos y accedan a recursos valiosos.",
      discussionsTab: "Discusiones",
      eventsTab: "Eventos",
      resourcesTab: "Recursos",
      creatorsTab: "Creadores",
      languageSelector: "Idioma"
    },
    fr: {
      welcomeText: "Bienvenue",
      loungeTitle: "Le Salon des Créateurs",
      loungeDescription: "Un espace détendu pour que les créateurs se connectent, partagent des idées, participent à des événements et accèdent à des ressources précieuses.",
      discussionsTab: "Discussions",
      eventsTab: "Événements",
      resourcesTab: "Ressources",
      creatorsTab: "Créateurs",
      languageSelector: "Langue"
    }
  };

  // Get text based on selected language
  const getText = (key: string): string => {
    return languageLabels[language]?.[key] || languageLabels["en"][key];
  };
  
  // New feature cards based on screenshot
  const featuredCards = [
    {
      id: "casual-conversations",
      title: "Casual Conversations",
      icon: <MessageSquare className="h-10 w-10 text-purple-500" />,
      description: "Join public chat rooms, create a private space for casual discussions with friends.",
      primaryAction: "Join Public Lounge",
      secondaryAction: "Create Private Room",
      color: "bg-purple-100",
      buttonClass: "bg-purple-600 hover:bg-purple-700"
    },
    {
      id: "brainstorming",
      title: "Brainstorming Sessions",
      icon: <Lightbulb className="h-10 w-10 text-teal-500" />,
      description: "Collaborative sessions with whiteboards, idea sharing, and tools for productive outcomes.",
      primaryAction: "Join Brainstorming Session",
      secondaryAction: "Create New Session",
      color: "bg-teal-100",
      buttonClass: "bg-teal-600 hover:bg-teal-700"
    },
    {
      id: "audio-recording",
      title: "Audio Recording",
      icon: <Mic className="h-10 w-10 text-purple-500" />,
      description: "Record and share your audio conversations for future reference or for those who couldn't attend.",
      primaryAction: "Start Audio Recording",
      secondaryAction: "Listen To Saved Recordings",
      color: "bg-purple-100",
      buttonClass: "bg-purple-600 hover:bg-purple-700"
    },
    {
      id: "video-recording",
      title: "Video Recording",
      icon: <Video className="h-10 w-10 text-teal-500" />,
      description: "Capture video of your sessions for review later or share with team members.",
      primaryAction: "Start Video Recording",
      secondaryAction: "View Saved Videos",
      color: "bg-teal-100",
      buttonClass: "bg-teal-600 hover:bg-teal-700"
    }
  ];

  // AI Note Taking features
  const aiNoteFeatures = [
    {
      id: "transcription",
      title: "Real-time Transcription",
      icon: <MessageSquare className="h-8 w-8 text-purple-500" />,
      description: "Automatic transcripts of all conversations as they happen."
    },
    {
      id: "summary",
      title: "Key Points Summary",
      icon: <FileText className="h-8 w-8 text-teal-500" />,
      description: "AI-generated highlights from your discussions."
    },
    {
      id: "multilingual",
      title: "Multilingual Support",
      icon: <Globe className="h-8 w-8 text-purple-500" />,
      description: "Transcription available in multiple languages."
    }
  ];
  
  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <div className="flex items-center">
            <Coffee className="h-6 w-6 mr-2" />
            <h1 className="text-2xl font-bold">
              <EditableText id="lounge-title">{getText("loungeTitle")}</EditableText>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">
              <EditableText id="lounge-welcome">
                {getText("welcomeText")}{user ? ` ${user.email?.split('@')[0] || ''}` : ''}
              </EditableText>
            </span>
          </div>
        </div>
        
        <p className="text-gray-600 mb-8">
          <EditableText id="lounge-description">
            A place where creators connect, communicate, and collaborate on creative projects
          </EditableText>
        </p>

        {/* Featured Cards - New Based on Screenshot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {featuredCards.map((card) => (
            <Card key={card.id} className={`overflow-hidden border ${card.color} border-gray-200`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-full p-2 bg-white shadow-sm">
                    {card.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">{card.title}</h3>
                    <p className="text-gray-600 mb-4">{card.description}</p>
                    <div className="space-y-2">
                      <Button className={`w-full ${card.buttonClass} text-white`}>
                        {card.primaryAction}
                      </Button>
                      <Button variant="outline" className="w-full">
                        {card.secondaryAction}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* AI Note Taking Section */}
        <Card className="bg-purple-50 mb-10">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-2">AI Note Taking</h2>
            <p className="text-gray-600 mb-6">
              Our AI assistant can transcribe and summarize your conversations, organizing key points and action items.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {aiNoteFeatures.map((feature) => (
                <div key={feature.id} className="flex items-start gap-3">
                  <div className="bg-white p-2 rounded-full shadow-sm">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-center">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                Create AI Notes Today
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Tabs defaultValue="discussions" className="w-full">
          <TabsList className="w-full mb-6 border-b overflow-x-auto flex justify-start">
            <ResponsiveTabsTrigger 
              value="discussions"
              icon={<MessageSquare className="h-4 w-4" />}
              text={<EditableText id="discussions-tab">{getText("discussionsTab")}</EditableText>}
              active={activeSection === 'discussions' || activeSection === ''}
              onClick={() => toggleSection('discussions')}
            />
            <ResponsiveTabsTrigger 
              value="events"
              icon={<Calendar className="h-4 w-4" />} 
              text={<EditableText id="events-tab">{getText("eventsTab")}</EditableText>}
              active={activeSection === 'events'}
              onClick={() => toggleSection('events')}
            />
            <ResponsiveTabsTrigger 
              value="resources"
              icon={<BookOpen className="h-4 w-4" />} 
              text={<EditableText id="resources-tab">{getText("resourcesTab")}</EditableText>}
              active={activeSection === 'resources'}
              onClick={() => toggleSection('resources')}
            />
            <ResponsiveTabsTrigger 
              value="creators"
              icon={<Users className="h-4 w-4" />} 
              text={<EditableText id="creators-tab">{getText("creatorsTab")}</EditableText>}
              active={activeSection === 'creators'}
              onClick={() => toggleSection('creators')}
            />
          </TabsList>
          
          {/* Discussions Tab */}
          {(activeSection === 'discussions' || activeSection === '') && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle>
                      <EditableText id="discussions-title">Community Discussions</EditableText>
                    </CardTitle>
                    <Button>
                      <EditableText id="new-discussion-btn">Start New Discussion</EditableText>
                    </Button>
                  </div>
                  <CardDescription>
                    <EditableText id="discussions-description">
                      Join conversations with fellow creators and share your insights
                    </EditableText>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {discussions.map((discussion) => (
                      <div key={discussion.id} className="border p-4 rounded-lg hover:bg-gray-50 transition cursor-pointer">
                        <div className="flex justify-between">
                          <h3 className="font-medium text-lg">{discussion.title}</h3>
                          <span className="text-sm text-gray-500">{discussion.date}</span>
                        </div>
                        <div className="flex items-center mt-1 text-sm text-gray-600">
                          <span>By {discussion.author}</span>
                          <span className="mx-2">•</span>
                          <span>{discussion.replies} replies</span>
                          <span className="mx-2">•</span>
                          <span>Last activity: {discussion.lastActivity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t">
                    <h3 className="font-medium mb-4">
                      <EditableText id="popular-tags">Popular Tags</EditableText>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm">Writing</Button>
                      <Button variant="outline" size="sm">Character Design</Button>
                      <Button variant="outline" size="sm">World Building</Button>
                      <Button variant="outline" size="sm">Audio</Button>
                      <Button variant="outline" size="sm">Visual</Button>
                      <Button variant="outline" size="sm">Publishing</Button>
                      <Button variant="outline" size="sm">Feedback</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Events Tab */}
          {activeSection === 'events' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle>
                      <EditableText id="events-title">Upcoming Events</EditableText>
                    </CardTitle>
                    <Button>
                      <EditableText id="propose-event-btn">Propose Event</EditableText>
                    </Button>
                  </div>
                  <CardDescription>
                    <EditableText id="events-description">
                      Workshops, meetups, and collaborative sessions for creators
                    </EditableText>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {events.map((event) => (
                      <div key={event.id} className="border p-4 rounded-lg hover:bg-gray-50 transition">
                        <div className="flex justify-between">
                          <h3 className="font-medium text-lg">{event.title}</h3>
                          <Button variant="outline" size="sm">
                            <EditableText id="register-btn">Register</EditableText>
                          </Button>
                        </div>
                        <div className="mt-2 space-y-1 text-sm">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                            <span>{event.date}</span>
                          </div>
                          <div className="flex items-center">
                            <Coffee className="h-4 w-4 mr-2 text-gray-500" />
                            <span>{event.time}</span>
                          </div>
                          <div className="flex items-center">
                            <MessageSquare className="h-4 w-4 mr-2 text-gray-500" />
                            <span>{event.location}</span>
                          </div>
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          <span>{event.attendees} attending</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Resources Tab */}
          {activeSection === 'resources' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-center">
                    <CardTitle>
                      <EditableText id="resources-title">Creator Resources</EditableText>
                    </CardTitle>
                    <Button>
                      <EditableText id="contribute-resource-btn">Contribute Resource</EditableText>
                    </Button>
                  </div>
                  <CardDescription>
                    <EditableText id="resources-description">
                      Guides, tutorials, and tools to enhance your creative process
                    </EditableText>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {resources.map((resource) => (
                      <div key={resource.id} className="border p-4 rounded-lg hover:bg-gray-50 transition">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-lg">{resource.title}</h3>
                            <p className="text-sm text-gray-600">By {resource.author}</p>
                          </div>
                          <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2 py-1 rounded">
                            {resource.type}
                          </span>
                        </div>
                        <div className="flex justify-between mt-4">
                          <span className="text-sm text-gray-600">{resource.downloads} downloads</span>
                          <Button variant="outline" size="sm">
                            <EditableText id="download-btn">Download</EditableText>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t">
                    <h3 className="font-medium mb-4">
                      <EditableText id="resource-categories">Categories</EditableText>
                    </h3>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center">
                        <BookOpen className="h-4 w-4 mr-2" />
                        <span>Writing</span>
                      </div>
                      <div className="flex items-center">
                        <Image className="h-4 w-4 mr-2" />
                        <span>Visual Art</span>
                      </div>
                      <div className="flex items-center">
                        <Mic className="h-4 w-4 mr-2" />
                        <span>Audio</span>
                      </div>
                      <div className="flex items-center">
                        <Video className="h-4 w-4 mr-2" />
                        <span>Video</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Creators Tab */}
          {activeSection === 'creators' && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>
                    <EditableText id="creators-title">Featured Creators</EditableText>
                  </CardTitle>
                  <CardDescription>
                    <EditableText id="creators-description">
                      Connect with fellow creators in our community
                    </EditableText>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input
                    className="mb-6"
                    placeholder="Search creators by name, interests, or specialty..."
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((id) => (
                      <div key={id} className="border rounded-lg p-4 text-center">
                        <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-3"></div>
                        <h3 className="font-medium">Creator Name {id}</h3>
                        <p className="text-sm text-gray-600 mb-2">Writer & Visual Artist</p>
                        <div className="flex justify-center space-x-2">
                          <Button variant="outline" size="sm">Profile</Button>
                          <Button size="sm">Connect</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </Tabs>
      </main>
      
      <CrowdlyFooter />
    </div>
  );
};

export default Lounge;
