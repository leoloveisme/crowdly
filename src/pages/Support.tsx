import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, LifeBuoy } from "lucide-react";
import EditableText from "@/components/EditableText";
import SupportHelpCenter from "@/modules/support/SupportHelpCenter";
import SupportDashboard from "@/modules/support/SupportDashboard";

// One role-aware page: everyone gets the help center (FAQ, support request
// and bug report forms); support staff additionally get the dashboard, which
// is their default tab unless a ?type= link points at one of the forms.
const Support = () => {
  const { user, hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const isStaff = !!user && (hasRole("platform_supporter") || hasRole("platform_admin"));

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-tr from-indigo-100 via-pink-50 to-white dark:from-indigo-950 dark:via-slate-950 dark:to-pink-950">
      <CrowdlyHeader />
      <main className="flex-grow container mx-auto max-w-6xl px-4 py-8">
        {isStaff ? (
          <Tabs defaultValue={searchParams.get("type") ? "help" : "dashboard"}>
            <TabsList className="mb-6">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" /> <EditableText id="support-heading">Support Dashboard</EditableText>
              </TabsTrigger>
              <TabsTrigger value="help" className="flex items-center gap-2">
                <LifeBuoy className="h-4 w-4" /> <EditableText id="support-tab-help">Help & support</EditableText>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="dashboard">
              <SupportDashboard />
            </TabsContent>
            <TabsContent value="help">
              <SupportHelpCenter />
            </TabsContent>
          </Tabs>
        ) : (
          <SupportHelpCenter />
        )}
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Support;
