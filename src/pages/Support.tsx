import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, MessageSquareText, Lightbulb, UserSearch } from "lucide-react";

const Support = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !hasRole("platform_supporter")) {
      navigate("/", { replace: true });
    }
  }, [user, hasRole, navigate]);

  if (!user || !hasRole("platform_supporter")) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-sky-100 to-white dark:from-background dark:via-background/70 dark:to-background/90">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto max-w-6xl px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">Support Dashboard</h2>

        <Tabs defaultValue="enquiries">
          <TabsList className="mb-4">
            <TabsTrigger value="enquiries" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" /> Support Enquiries
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" /> User Feedback
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> Feature Suggestions
            </TabsTrigger>
            <TabsTrigger value="lookup" className="flex items-center gap-2">
              <UserSearch className="h-4 w-4" /> User Lookup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enquiries">
            <Card>
              <CardHeader>
                <CardTitle>Support Enquiries</CardTitle>
                <CardDescription>View and manage user support tickets.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Ticket className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">No support enquiries yet</p>
                  <p className="text-sm mt-1">Support tickets from users will appear here.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>User Feedback</CardTitle>
                <CardDescription>Review and manage feedback submitted by users.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <MessageSquareText className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">No user feedback yet</p>
                  <p className="text-sm mt-1">User feedback submissions will appear here.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions">
            <Card>
              <CardHeader>
                <CardTitle>Feature Suggestions</CardTitle>
                <CardDescription>Review feature suggestions from users.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">Feature suggestions are managed on a dedicated page</p>
                  <p className="text-sm mt-1 mb-4">View and manage all feature suggestions in one place.</p>
                  <Link
                    to="/feature-suggestions"
                    className="text-indigo-600 hover:text-indigo-800 underline font-medium"
                  >
                    Go to Feature Suggestions
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lookup">
            <Card>
              <CardHeader>
                <CardTitle>User Lookup</CardTitle>
                <CardDescription>Search for user accounts to assist them.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <UserSearch className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium">User lookup coming soon</p>
                  <p className="text-sm mt-1">Search and look up user accounts to provide assistance.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Support;
