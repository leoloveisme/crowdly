
import React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ResponsiveTabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsTrigger> {
  icon: React.ReactNode;
  text: React.ReactNode; // Changed from string to ReactNode to accept any React element
  onClick?: () => void;
  active?: boolean;
}

const ResponsiveTabsTrigger = ({ 
  icon, 
  text, 
  className,
  onClick,
  active,
  ...props 
}: ResponsiveTabsTriggerProps) => {
  const isMobile = useIsMobile();
  
  return (
    <TabsTrigger 
      className={cn(
        "flex items-center gap-1", 
        active ? "border-b-2 border-primary" : "",
        className
      )} 
      onClick={onClick}
      {...props}
    >
      {icon}
      {!isMobile && <span>{text}</span>}
    </TabsTrigger>
  );
};

export default ResponsiveTabsTrigger;
