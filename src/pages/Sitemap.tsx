import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import EditableText from "@/components/EditableText";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Compass,
  BookOpen,
  PenSquare,
  Users,
  UserCircle,
  Building2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

interface SitemapLink {
  id: string;
  label: string;
  href: string;
}

interface SitemapSection {
  id: string;
  titleId: string;
  title: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  links: SitemapLink[];
}

const sections: SitemapSection[] = [
  {
    id: "discover",
    titleId: "sitemap-section-discover",
    title: "Discover & Browse",
    icon: Compass,
    links: [
      { id: "sitemap-link-home", label: "Home", href: "/" },
      { id: "sitemap-link-search", label: "Search", href: "/search" },
      { id: "sitemap-link-lounge", label: "Lounge", href: "/lounge" },
      { id: "sitemap-link-favorites", label: "Favorites", href: "/favorites" },
    ],
  },
  {
    id: "stories",
    titleId: "sitemap-section-stories",
    title: "Stories, Screenplays & Comics",
    icon: BookOpen,
    links: [
      { id: "sitemap-link-newest-stories", label: "Newest Stories", href: "/newest_stories" },
      { id: "sitemap-link-newest-screenplays", label: "Newest Screenplays", href: "/newest_screenplays" },
      { id: "sitemap-link-newest-comics", label: "Newest Comics", href: "/newest_comics" },
      { id: "sitemap-link-living-stories", label: "Living Stories", href: "/living_stories" },
      { id: "sitemap-link-lived-stories", label: "Lived Stories", href: "/lived_stories" },
      { id: "sitemap-link-story-to-live", label: "Story(-ies) to live / to experience", href: "/story-to-live" },
      { id: "sitemap-link-story-for-consumers", label: "Story for Consumers", href: "/story-for-consumers" },
    ],
  },
  {
    id: "create",
    titleId: "sitemap-section-create",
    title: "Create",
    icon: PenSquare,
    links: [
      { id: "sitemap-link-new-story", label: "New Story Template", href: "/new-story-template" },
      { id: "sitemap-link-new-comic", label: "New Comic Template", href: "/new-comic-template" },
    ],
  },
  {
    id: "community",
    titleId: "sitemap-section-community",
    title: "Community",
    icon: Users,
    links: [
      { id: "sitemap-link-friends", label: "Friends", href: "/friends" },
      { id: "sitemap-link-communications", label: "Communications", href: "/communications" },
      { id: "sitemap-link-suggest-feature", label: "Suggest a Feature", href: "/suggest-feature" },
      { id: "sitemap-link-feature-suggestions", label: "Suggested Features", href: "/feature-suggestions" },
      { id: "sitemap-link-feedback", label: "Send Feedback", href: "/feedback" },
      { id: "sitemap-link-contact", label: "Contact", href: "/contact" },
    ],
  },
  {
    id: "account",
    titleId: "sitemap-section-account",
    title: "Account",
    icon: UserCircle,
    links: [
      { id: "sitemap-link-profile", label: "Profile", href: "/profile" },
      { id: "sitemap-link-account-admin", label: "Account Administration", href: "/account-administration" },
    ],
  },
  {
    id: "company",
    titleId: "sitemap-section-company",
    title: "Company",
    icon: Building2,
    links: [
      { id: "sitemap-link-software", label: "Crowdly Software", href: "/software" },
      { id: "sitemap-link-about-us", label: "About Us", href: "/about-us" },
      { id: "sitemap-link-support", label: "Support", href: "/support" },
    ],
  },
  {
    id: "platform-admin",
    titleId: "sitemap-section-platform-admin",
    title: "Platform Administration",
    icon: ShieldCheck,
    adminOnly: true,
    links: [
      { id: "sitemap-link-platform-admin", label: "Platform Admin", href: "/platform-admin" },
      { id: "sitemap-link-admin", label: "Admin", href: "/admin" },
      { id: "sitemap-link-invite-users", label: "Invite Users", href: "/admin/invite-users" },
    ],
  },
];

const Sitemap = () => {
  const { user, hasRole } = useAuth();
  const isAdmin = !!user && hasRole("platform_admin");

  const visibleSections = sections.filter((section) => !section.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-tr from-indigo-100 via-pink-50 to-white dark:from-indigo-950 dark:via-slate-950 dark:to-pink-950">
      <CrowdlyHeader />

      <div className="container mx-auto max-w-6xl px-4 py-8 flex-grow">
        <h1 className="text-3xl font-bold mb-2 text-center bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent">
          <EditableText id="sitemap-title">Site map</EditableText>
        </h1>
        <p className="text-muted-foreground text-center mb-8">
          <EditableText id="sitemap-subtitle">Everything Crowdly has to offer, in one place.</EditableText>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card
                key={section.id}
                className="hover-scale rounded-2xl border-pink-200/40 dark:border-indigo-800/60 shadow-lg"
              >
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <div className="rounded-full p-2 bg-gradient-to-tr from-pink-100 to-indigo-200 shadow border-2 border-indigo-200 dark:bg-indigo-700/40 dark:border-indigo-800">
                    <Icon className="h-5 w-5 text-indigo-700 dark:text-indigo-200" />
                  </div>
                  <CardTitle className="text-xl">
                    <EditableText id={section.titleId}>{section.title}</EditableText>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-1">
                  {section.links.map((link) => (
                    <Link
                      key={link.id}
                      to={link.href}
                      className="block rounded-md p-2 text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-800 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-200"
                    >
                      <EditableText id={link.id}>{link.label}</EditableText>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <CrowdlyFooter />
    </div>
  );
};

export default Sitemap;
