
import React from "react";
import { Button } from "@/components/ui/button";
import { Grid2x2, Columns4 } from "lucide-react";

// Descriptions for 8 layout options
const layoutIcons = [
  {
    key: 0,
    label: "One horizontal, two vertical",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
        <rect x="3" y="3" width="18" height="18" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="12" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    key: 1,
    label: "Two horizontal, two vertical",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
        <rect x="3" y="3" width="18" height="18" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="12" y1="15" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    key: 2,
    label: "Four vertical",
    render: () => <Columns4 size={24} />,
  },
  {
    key: 3,
    label: "Four horizontal",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
        <rect x="3" y="3" width="18" height="18" />
        <line x1="3" y1="7.5" x2="21" y2="7.5" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="16.5" x2="21" y2="16.5" />
      </svg>
    ),
  },
  {
    key: 4,
    label: "Four squares within a square",
    render: () => <Grid2x2 size={24} />,
  },
  {
    key: 5,
    label: "Two vertical, two horizontal",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
        <rect x="3" y="3" width="18" height="18" />
        <line x1="12" y1="3" x2="12" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" /> 
        <line x1="3" y1="9" x2="21" y2="9" />
      </svg>
    ),
  },
  {
    key: 6,
    label: "Two vertical, one horizontal",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
        <rect x="3" y="3" width="18" height="18" />
        <line x1="12" y1="3" x2="12" y2="12" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
  {
    key: 7,
    label: "Z shape",
    render: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
        <rect x="3" y="3" width="18" height="18"/>
        <polyline points="6,7 18,7 6,17 18,17" />
      </svg>
    ),
  },
];

interface LayoutOptionButtonsProps {
  active: number | null;
  onSelect: (key: number) => void;
  className?: string;
}

export const LayoutOptionButtons: React.FC<LayoutOptionButtonsProps> = ({ active, onSelect, className }) => (
  <div className={`flex gap-2 ${className || ""}`}>
    {layoutIcons.map((item) => (
      <Button
        key={item.key}
        variant={active === item.key ? "default" : "outline"}
        size="icon"
        aria-label={item.label}
        title={item.label}
        className={`p-0 h-10 w-10 flex items-center justify-center`}
        onClick={() => onSelect(item.key)}
      >
        {item.render()}
      </Button>
    ))}
  </div>
);

export default LayoutOptionButtons;
