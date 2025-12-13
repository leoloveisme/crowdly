
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import EditableText from "@/components/EditableText";

const Sitemap = () => {
  const { user, hasRole, roles } = useAuth();
  const [showPopover, setShowPopover] = useState(false);
  
  // Debug logging
  React.useEffect(() => {
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
      
      <div className="container mx-auto py-8 flex-grow">
        <h1 className="text-3xl font-bold mb-8 text-center">
          <EditableText id="sitemap-title">Site Map</EditableText>
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              <EditableText id="community-section">Community</EditableText>
            </h2>
            <div className="space-y-2">
              <Link 
                to="/suggest-feature" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="popover-suggest-feature">
                  Suggest a Feature
                </EditableText>
              </Link>
            </div>

            <div className="space-y-2">
              <Link 
                to="/feature-suggestions" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="popover-feature-suggestions">
                  Suggested Features
                </EditableText>
              </Link>
            </div>


          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              <EditableText id="admin-section">Administration</EditableText>
            </h2>
            <div className="space-y-2">
              <Link 
                to="/account-administration" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="popover-account-admin">
                  Account Administration
                </EditableText>
              </Link>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              <EditableText id="stories-section">Stories</EditableText>
            </h2>
            <div className="space-y-2">
              <Link 
                to="/new-story-template" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="popover-new-story">
                  New Story Template
                </EditableText>
              </Link>
              
              <Link 
                to="/story-for-consumers" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="story-for-consumers">
                  Story for consumers
                </EditableText>
              </Link>
              
              <Link 
                to="/story-to-live" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="story-to-live">
                  Story(-ies) to live / to experience
                </EditableText>
              </Link>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              <EditableText id="user-section">User</EditableText>
            </h2>
            <div className="space-y-2">
              <Link 
                to="/profile" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="popover-profile">
                  Profile
                </EditableText>
              </Link>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              <EditableText id="finding-your-ways">Finding your ways</EditableText>
            </h2>
            <div className="space-y-2">
                <EditableText id="sitemap">
                  Sitemap - This page
                </EditableText>
            </div>
            <div className="space-y-2">
             <Link to="/lounge"  className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="lounge">
                  Lounge
                </EditableText>
              </Link>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              <EditableText id="about-section">Company</EditableText>
            </h2>
            <div className="space-y-2">
              <Link 
                to="/about-us" 
                className="block p-2 hover:bg-gray-100 rounded-md transition-colors"
                onClick={() => setShowPopover(false)}
              >
                <EditableText id="about-us-link">
                  About Us
                </EditableText>
              </Link>
            </div>
          </div>
        </div>
      </div>





      
      <CrowdlyFooter />
    </div>
  );
};

export default Sitemap;
