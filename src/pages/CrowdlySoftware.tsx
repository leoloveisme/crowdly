
import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import EditableText from "@/components/EditableText";

// The desktop app ships as two downloads of the same app - "Crowdly
// Discovery" and "Crowdly Creation" - that differ only in the mode they open
// in the first time (see apps/desktop/src/editor/app_modes.py). Fill in the
// URLs once the builds are uploaded to the VPS; until then the buttons show
// "coming soon".
const DESKTOP_DOWNLOADS: Record<"discovery" | "creation", string | null> = {
  discovery: null,
  creation: null,
};

const CrowdlySoftware = () => {
  const { user, hasRole, roles } = useAuth();
  const location = useLocation();

  // Footer links point at /software#discovery and /software#creation.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);
  
  // Debug logging
  useEffect(() => {
    if (user) {
      console.log("Current user:", user?.email);
      console.log("User roles:", roles);
      console.log("Is admin?", hasRole('platform_admin'));
    } else {
      console.log("No user is logged in");
    }
  }, [user, roles, hasRole]);
  
  const isAdmin = user && hasRole('platform_admin');

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      
      <div className="flex-grow flex items-center justify-center bg-gray-50">
        <div className="text-center px-4">
          {isAdmin && (
            <h2 className="text-4xl font-bold mb-2 text-red-600">
              <EditableText id="admin-message">
                You are logged in as platform admin
              </EditableText>
            </h2>
          )}
<h1>&nbsp;</h1>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent hidden md:block px-2">
            <EditableText id="software-title">
              Crowdly Software
            </EditableText>
          </h1>
          <p className="text-xl text-blue-600 mb-8">
            <EditableText id="software-empty-paragraph">
            
            </EditableText>
          </p>        
          
          <div className="space-y-4">
            <p className="mb-2">
              <EditableText id="crowdly-software">
               Here you will be able to download Crowdly software: desktop and mobile apps made for various operating systems
              </EditableText>
            </p>    
            <p className="mb-2  text-blue-600">
              <EditableText id="crowdly-software">
               <a href="http://crowdly.cloud/web_app" title="Crowdly web app" target="_blank" rel="noopener noreferrer">Launch Crowdly web app</a>
              </EditableText>
            </p>     
            <p className="mb-2 text-blue-600">
              <EditableText id="crowdly-on-github">
                <a href="https://github.com/leoloveisme/crowdly" title="Crowdly on Github" target="_blank" rel="noopener noreferrer">Crowdly on Github</a> 
              </EditableText>
</p>
<p className="mb-2">
              <EditableText id="crowdly-on-github">
                 Feel free to contribute to this open sourced project
              </EditableText>
            </p>           
     
          </div>

          <section className="mt-12 mb-16 max-w-4xl mx-auto text-left">
            <EditableText id="software-desktop-title" as="h2" className="text-2xl font-bold text-indigo-900 mb-2">
              Crowdly desktop app
            </EditableText>
            <EditableText id="software-desktop-intro" as="p" className="text-gray-700 mb-6">
              One app with two modes: Discovery for reading and listening, Creation for writing. Choose the mode you want to start in - you can switch at any time.
            </EditableText>

            <div className="grid gap-6 md:grid-cols-2">
              {(["discovery", "creation"] as const).map((mode) => (
                <div
                  key={mode}
                  id={mode}
                  className="scroll-mt-24 rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm flex flex-col"
                >
                  {mode === "discovery" ? (
                    <>
                      <EditableText id="software-discovery-title" as="h3" className="text-xl font-semibold text-indigo-800 mb-2">
                        Crowdly Discovery
                      </EditableText>
                      <EditableText id="software-discovery-desc" as="p" className="text-gray-600 mb-4 flex-grow">
                        Read and listen: your private library of books and audiobooks, Crowdly stories, and reading positions, highlights and notes synced across your devices.
                      </EditableText>
                    </>
                  ) : (
                    <>
                      <EditableText id="software-creation-title" as="h3" className="text-xl font-semibold text-indigo-800 mb-2">
                        Crowdly Creation
                      </EditableText>
                      <EditableText id="software-creation-desc" as="p" className="text-gray-600 mb-4 flex-grow">
                        Write: a distraction-free editor for stories and screenplays that syncs with Crowdly, your creative Spaces, GitHub and Google Drive.
                      </EditableText>
                    </>
                  )}
                  {DESKTOP_DOWNLOADS[mode] ? (
                    <Button asChild>
                      <a href={DESKTOP_DOWNLOADS[mode] as string}>
                        <EditableText id={`software-download-${mode}`}>Download</EditableText>
                      </a>
                    </Button>
                  ) : (
                    <Button disabled>
                      <EditableText id="software-download-soon">Download - coming soon</EditableText>
                    </Button>
                  )}
                  <EditableText id="software-desktop-platforms" as="p" className="text-xs text-gray-500 mt-2">
                    macOS, Windows and Linux
                  </EditableText>
                </div>
              ))}
            </div>

            <EditableText id="software-desktop-alpha-note" as="p" className="text-sm text-gray-600 mt-6">
              Crowdly is invite-only during the alpha, so the app asks for your Crowdly account.
            </EditableText>
            <EditableText id="software-mobile-soon" as="p" className="text-sm text-gray-600 mt-1">
              Crowdly Discovery and Crowdly Creation for Android (Google Play) and iPhone/iPad (App Store) will follow.
            </EditableText>
          </section>
       </div>
      </div>
      
      <CrowdlyFooter />
    </div>
  );
};

export default CrowdlySoftware;
