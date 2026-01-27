
import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import EditableText from "@/components/EditableText";

const CrowdlySoftware = () => {
  const { user, hasRole, roles } = useAuth();
  
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
          <p className="text-xl text-gray-600 mb-8">
            <EditableText id="software-empty-paragraph">
            
            </EditableText>
          </p>        
          
          <div className="space-y-4">
            <p className="mb-2">
              <EditableText id="crowdly-software">
               Here you will be able to download Crowdly software: desktop and mobile apps
              </EditableText>
            </p>    
            <p className="mb-2">
              <EditableText id="crowdly-software">
               <a href="http://localhost:5173" title="Crowdly web app" target="_blank" rel="noopener noreferrer">Launch Crowdly web app</a>
              </EditableText>
            </p>     
            <p className="mb-2">
              <EditableText id="crowdly-on-github">
                <a href="https://github.com/leoloveisme/crowdly" title="Crowdly on Github" target="_blank" rel="noopener noreferrer">Crowdly on Github</a> - feel free to contribute to this open sourced project
              </EditableText>
            </p>           
     
          </div>
       </div>
      </div>
      
      <CrowdlyFooter />
    </div>
  );
};

export default CrowdlySoftware;
