import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AlphaProvider, useAlpha } from "./contexts/AlphaContext";
import { EditableContentProvider } from "./contexts/EditableContentContext";
import Index from "./pages/Index";
import SuggestFeature from "./pages/SuggestFeature";
import FeatureSuggestions from "./pages/FeatureSuggestions";
import AccountAdministration from "./pages/AccountAdministration";
import NewStoryTemplate from "./pages/NewStoryTemplate";
import StoryforConsumers from "./pages/StoryforConsumers";
import StoryToLiveToExperience from "./pages/StoryToLiveToExperience";
import Profile from "./pages/Profile";
import Sitemap from "./pages/Sitemap";
import Lounge from "./pages/Lounge";
import CrowdlySoftware from "./pages/CrowdlySoftware";
import AboutUs from "./pages/AboutUs";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import EditingModeToggle from "./components/EditingModeToggle";
import Story from "./pages/Story";
import Screenplay from "./pages/Screenplay";
import PublicProfile from "./pages/PublicProfile";
import CreativeSpacePage from "./pages/CreativeSpacePage";
import StoryDetails from "./pages/StoryDetails";
import StoriesSpacesMigration from "./pages/StoriesSpacesMigration";
import FavoritesOutput from "./pages/FavoritesOutput";
import NewestStoriesOutput from "./pages/NewestStoriesOutput";
import LivingStoriesOutput from "./pages/LivingStoriesOutput";
import LivedStoriesOutput from "./pages/LivedStoriesOutput";
import NewestScreenplaysOutput from "./pages/NewestScreenplaysOutput";
import SearchPage from "./pages/Search";
import AlphaGate from "./pages/AlphaGate";
import InviteUsers from "./pages/InviteUsers";

const queryClient = new QueryClient();

// Route guard: redirect to /alpha if not logged in and not alpha-validated
const AlphaGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { isAlphaValidated } = useAlpha();
  const location = useLocation();

  if (loading) return null;

  // Logged-in users always pass through
  if (user) return <>{children}</>;

  // Alpha-validated users pass through
  if (isAlphaValidated) return <>{children}</>;

  // Redirect to alpha gate
  return <Navigate to="/alpha" state={{ from: location }} replace />;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AlphaProvider>
              <EditableContentProvider>
                <Routes>
                  {/* Alpha gate is always accessible */}
                  <Route path="/alpha" element={<AlphaGate />} />

                  {/* All other routes are protected by the alpha guard */}
                  <Route path="/" element={<AlphaGuard><Index /></AlphaGuard>} />
                  <Route path="/suggest-feature" element={<AlphaGuard><SuggestFeature /></AlphaGuard>} />
                  <Route path="/feature-suggestions" element={<AlphaGuard><FeatureSuggestions /></AlphaGuard>} />
                  <Route path="/account-administration" element={<AlphaGuard><AccountAdministration /></AlphaGuard>} />
                  <Route path="/new-story-template" element={<AlphaGuard><NewStoryTemplate /></AlphaGuard>} />
                  <Route path="/story-for-consumers" element={<AlphaGuard><StoryforConsumers /></AlphaGuard>} />
                  <Route path="/story-to-live" element={<AlphaGuard><StoryToLiveToExperience /></AlphaGuard>} />
                  <Route path="/profile" element={<AlphaGuard><Profile /></AlphaGuard>} />
                  <Route path="/sitemap" element={<AlphaGuard><Sitemap /></AlphaGuard>} />
                  <Route path="/software" element={<AlphaGuard><CrowdlySoftware /></AlphaGuard>} />
                  <Route path="/about-us" element={<AlphaGuard><AboutUs /></AlphaGuard>} />
                  <Route path="/lounge" element={<AlphaGuard><Lounge /></AlphaGuard>} />
                  <Route path="/login" element={<AlphaGuard><Login /></AlphaGuard>} />
                  <Route path="/register" element={<AlphaGuard><Register /></AlphaGuard>} />
                  <Route path="/stories/spaces-migration" element={<AlphaGuard><StoriesSpacesMigration /></AlphaGuard>} />
                  <Route path="/admin/invite-users" element={<AlphaGuard><InviteUsers /></AlphaGuard>} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="/search" element={<AlphaGuard><SearchPage /></AlphaGuard>} />
                  <Route path="/story/:story_id" element={<AlphaGuard><Story /></AlphaGuard>} />
                  <Route path="/story/:story_id/chapter/:chapter_id" element={<AlphaGuard><Story /></AlphaGuard>} />
                  <Route path="/story/:story_id/details" element={<AlphaGuard><StoryDetails /></AlphaGuard>} />
                  <Route path="/screenplay/:screenplay_id" element={<AlphaGuard><Screenplay /></AlphaGuard>} />
                  <Route path="/creative_space/:spaceId" element={<AlphaGuard><CreativeSpacePage /></AlphaGuard>} />
                  <Route path="/favorites" element={<AlphaGuard><FavoritesOutput /></AlphaGuard>} />
                  <Route path="/newest_stories" element={<AlphaGuard><NewestStoriesOutput /></AlphaGuard>} />
                  <Route path="/newest_screenplays" element={<AlphaGuard><NewestScreenplaysOutput /></AlphaGuard>} />
                  <Route path="/living_stories" element={<AlphaGuard><LivingStoriesOutput /></AlphaGuard>} />
                  <Route path="/lived_stories" element={<AlphaGuard><LivedStoriesOutput /></AlphaGuard>} />
                  {/* Public user page, e.g. /leolove */}
                  <Route path="/:username" element={<AlphaGuard><PublicProfile /></AlphaGuard>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <EditingModeToggle />
              </EditableContentProvider>
            </AlphaProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
