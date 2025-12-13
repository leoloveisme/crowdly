
import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import { useAuth } from "@/contexts/AuthContext";
import EditableText from "@/components/EditableText";

const AboutUs = () => {
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
          <h1 className="text-4xl font-bold mb-6 text-[#1A1F2C]">
            <EditableText id="main-title">
              Crowd created entertainment
            </EditableText>
          </h1>
          <h1 className="text-4xl font-bold mb-6 text-[#1A1F2C]">
            <EditableText id="main-title2">
              Entertainment Platform
            </EditableText>
          </h1>          
          <p className="text-xl text-gray-600 mb-8">
            <EditableText id="main-subtitle">
              The entertainment platform where your voice matters
            </EditableText>
          </p>
          
          <div className="space-y-4">
            <p className="mb-2">
              <EditableText id="feedback-message">
                We value your feedback and ideas!
              </EditableText>
            </p>      
            <p className="mb-2">
              <EditableText id="feedback-message">
                Feel free to contribute to this open sourced project on Github under https://github.com/leoloveisme/crowdly_lovable
              </EditableText>
            </p>           
     
          </div>
       </div>
      </div>
      
      <CrowdlyFooter />
    </div>
  );
};

export default AboutUs;
