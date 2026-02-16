import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, MessageSquareText, Lightbulb, UserSearch } from "lucide-react";
import EditableText from "@/components/EditableText";

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
        <EditableText id="support-heading" as="h2" className="text-2xl font-bold mb-6">Support Dashboard</EditableText>

        <Tabs defaultValue="enquiries">
          <TabsList className="mb-4">
            <TabsTrigger value="enquiries" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" /> <EditableText id="support-tab-enquiries">Support Enquiries</EditableText>
            </TabsTrigger>
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" /> <EditableText id="support-tab-feedback">User Feedback</EditableText>
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> <EditableText id="support-tab-suggestions">Feature Suggestions</EditableText>
            </TabsTrigger>
            <TabsTrigger value="lookup" className="flex items-center gap-2">
              <UserSearch className="h-4 w-4" /> <EditableText id="support-tab-lookup">User Lookup</EditableText>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enquiries">
            <Card>
              <CardHeader>
                <CardTitle><EditableText id="support-enquiries-title">Support Enquiries</EditableText></CardTitle>
                <CardDescription><EditableText id="support-enquiries-desc">View and manage user support tickets.</EditableText></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Ticket className="h-12 w-12 mb-4 opacity-30" />
                  <EditableText id="support-enquiries-empty" as="p" className="text-lg font-medium">No support enquiries yet</EditableText>
                  <EditableText id="support-enquiries-empty-detail" as="p" className="text-sm mt-1">Support tickets from users will appear here.</EditableText>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle><EditableText id="support-feedback-title">User Feedback</EditableText></CardTitle>
                <CardDescription><EditableText id="support-feedback-desc">Review and manage feedback submitted by users.</EditableText></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <MessageSquareText className="h-12 w-12 mb-4 opacity-30" />
                  <EditableText id="support-feedback-empty" as="p" className="text-lg font-medium">No user feedback yet</EditableText>
                  <EditableText id="support-feedback-empty-detail" as="p" className="text-sm mt-1">User feedback submissions will appear here.</EditableText>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions">
            <Card>
              <CardHeader>
                <CardTitle><EditableText id="support-suggestions-title">Feature Suggestions</EditableText></CardTitle>
                <CardDescription><EditableText id="support-suggestions-desc">Review feature suggestions from users.</EditableText></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mb-4 opacity-30" />
                  <EditableText id="support-suggestions-managed" as="p" className="text-lg font-medium">Feature suggestions are managed on a dedicated page</EditableText>
                  <EditableText id="support-suggestions-managed-detail" as="p" className="text-sm mt-1 mb-4">View and manage all feature suggestions in one place.</EditableText>
                  <Link
                    to="/feature-suggestions"
                    className="text-indigo-600 hover:text-indigo-800 underline font-medium"
                  >
                    <EditableText id="support-go-to-suggestions">Go to Feature Suggestions</EditableText>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lookup">
            <Card>
              <CardHeader>
                <CardTitle><EditableText id="support-lookup-title">User Lookup</EditableText></CardTitle>
                <CardDescription><EditableText id="support-lookup-desc">Search for user accounts to assist them.</EditableText></CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <UserSearch className="h-12 w-12 mb-4 opacity-30" />
                  <EditableText id="support-lookup-empty" as="p" className="text-lg font-medium">User lookup coming soon</EditableText>
                  <EditableText id="support-lookup-empty-detail" as="p" className="text-sm mt-1">Search and look up user accounts to provide assistance.</EditableText>
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
