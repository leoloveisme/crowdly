
import React, { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { CalendarIcon, ThumbsUp, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface FeatureSuggestion {
  id: string;
  first_name: string | null;
  last_name: string | null;
  description: string;
  created_at: string;
  visibility: 'public' | 'private' | 'anonymous';
  attachments: any[] | null;
}

const FeatureSuggestions = () => {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<FeatureSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const { data, error } = await supabase
          .from('feature_suggestions')
          .select('*')
          .or('visibility.eq.public,visibility.eq.anonymous')
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        setSuggestions(data as FeatureSuggestion[]);
      } catch (error) {
        console.error("Error fetching suggestions:", error);
        toast({
          title: "Error",
          description: "Failed to load feature suggestions",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [toast]);

  const getAuthorName = (suggestion: FeatureSuggestion) => {
    if (suggestion.visibility === 'anonymous') {
      return 'Anonymous';
    }
    return `${suggestion.first_name} ${suggestion.last_name}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Date unknown';
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      
      <div className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-[#1A1F2C]">Suggested features</h1>
          <Button 
            asChild 
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Link to="/suggest-feature">
              Suggest a Feature
            </Link>
          </Button>
        </div>
        
        <div className="mb-8">
          <p className="text-gray-600">
            Browse through feature suggestions from our community or submit your own ideas to help us improve.
          </p>
        </div>
        
        {isLoading ? (
          // Loading skeletons
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="shadow-md">
                <CardHeader className="pb-4">
                  <div className="flex justify-between">
                    <Skeleton className="h-8 w-1/3" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex space-x-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : suggestions.length > 0 ? (
          <div className="space-y-6">
            {suggestions.map((suggestion) => (
              <Card key={suggestion.id} className="shadow-md">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl font-bold">
                        {suggestion.description.length > 50 
                          ? suggestion.description.substring(0, 50) + '...' 
                          : suggestion.description}
                      </CardTitle>
                      <CardDescription className="flex items-center mt-1">
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        {formatDate(suggestion.created_at)}
                      </CardDescription>
                    </div>
                    <Badge variant={suggestion.visibility === 'anonymous' ? 'outline' : 'default'}>
                      {suggestion.visibility === 'anonymous' ? 'Anonymous' : 'Public'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-line">
                    {suggestion.description}
                  </p>
                  
                  {suggestion.attachments && suggestion.attachments.length > 0 && (
                    <div className="mt-4">
                      <p className="font-semibold text-sm mb-2">Attachments:</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestion.attachments.map((attachment, idx) => (
                          <Badge variant="secondary" key={idx} className="flex items-center">
                            {attachment.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex justify-between items-center border-t pt-4">
                  <div className="text-sm text-gray-500">
                    Suggested by: <span className="font-medium">{getAuthorName(suggestion)}</span>
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" className="flex items-center">
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      <span>Vote</span>
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      <span>Comment</span>
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <h3 className="text-2xl font-semibold mb-2">No suggestions yet</h3>
            <p className="text-gray-500 mb-6">Be the first to suggest a feature!</p>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
              <Link to="/suggest-feature">Suggest a Feature</Link>
            </Button>
          </div>
        )}
      </div>
      
      <CrowdlyFooter />
    </div>
  );
};

export default FeatureSuggestions;
