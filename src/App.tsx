import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
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

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <EditableContentProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/suggest-feature" element={<SuggestFeature />} />
                <Route path="/feature-suggestions" element={<FeatureSuggestions />} />
                <Route path="/account-administration" element={<AccountAdministration />} />
                <Route path="/new-story-template" element={<NewStoryTemplate />} />
                <Route path="/story-for-consumers" element={<StoryforConsumers />} />
                <Route path="/story-to-live" element={<StoryToLiveToExperience />} />   
                <Route path="/profile" element={<Profile />} />
                <Route path="/sitemap" element={<Sitemap />} />
                <Route path="/software" element={<CrowdlySoftware />} />
                <Route path="/about-us" element={<AboutUs />} />
                <Route path="/lounge" element={<Lounge />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/stories/spaces-migration" element={<StoriesSpacesMigration />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="/search" element={<SearchPage />} />
                <Route path="/story/:story_id" element={<Story />} />
                <Route path="/story/:story_id/chapter/:chapter_id" element={<Story />} />
                <Route path="/story/:story_id/details" element={<StoryDetails />} />
                <Route path="/screenplay/:screenplay_id" element={<Screenplay />} />
                <Route path="/creative_space/:spaceId" element={<CreativeSpacePage />} />
                <Route path="/favorites" element={<FavoritesOutput />} />
                <Route path="/newest_stories" element={<NewestStoriesOutput />} />
                <Route path="/newest_screenplays" element={<NewestScreenplaysOutput />} />
                <Route path="/living_stories" element={<LivingStoriesOutput />} />
                <Route path="/lived_stories" element={<LivedStoriesOutput />} />
                {/* Public user page, e.g. /leolove */}
                <Route path="/:username" element={<PublicProfile />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <EditingModeToggle />
            </EditableContentProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
