
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, 
  TableBody, 
  TableCell, 
  TableRow 
} from "@/components/ui/table";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Grid2x2, Columns4, X, Info } from "lucide-react";
import EditableText from "@/components/EditableText";

interface RevisionType {
  id: number;
  text: string;
  time: string;
}

interface RevisionComparisonProps {
  revisions: RevisionType[];
  className?: string;
}

const RevisionComparison: React.FC<RevisionComparisonProps> = ({ revisions, className }) => {
  const [selectedRevisions, setSelectedRevisions] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [activeLayoutOption, setActiveLayoutOption] = useState<number | null>(null);

  // Functions for revision comparison
  const toggleCompare = () => {
    setCompareOpen(!compareOpen);
  };

  const toggleRevisionSelection = (revisionId: number) => {
    setSelectedRevisions(prev => {
      if (prev.includes(revisionId)) {
        return prev.filter(id => id !== revisionId);
      } else {
        // Limit to 4 selections
        if (prev.length >= 4) {
          return [...prev.slice(1), revisionId];
        }
        return [...prev, revisionId];
      }
    });
  };
  
  const handleLayoutOptionClick = (layoutIndex: number) => {
    setActiveLayoutOption(layoutIndex);
  };

  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-4">
        <span className="text-blue-500 text-sm hover:underline cursor-pointer">
          <EditableText id="revisions-heading">Revisions</EditableText>
        </span>
        <Info className="h-5 w-5 text-gray-400" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-4 text-sm text-gray-600">
                <EditableText id="compare-tooltip-trigger">
                  Compare up to 4 revisions
                </EditableText>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                <EditableText id="compare-tooltip-content">
                  You can select and compare up to 4 revisions
                </EditableText>
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <div className="mb-4">
        <Table>
          <TableBody>
            {revisions.map((revision) => (
              <TableRow key={revision.id}>
                <TableCell className="font-medium w-10">{revision.id}</TableCell>
                <TableCell className="text-blue-500">{revision.time}</TableCell>
                <TableCell className="w-8">
                  <Checkbox 
                    id={`revision-${revision.id}`} 
                    checked={selectedRevisions.includes(revision.id)}
                    onCheckedChange={() => toggleRevisionSelection(revision.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3}>
                <div className="flex justify-between items-center">
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="text-blue-500 p-0"
                    onClick={toggleCompare}
                  >
                    Compare
                  </Button>
                  <Button variant="ghost" size="sm" className="p-1 h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      
      {/* Comparison Container */}
      {compareOpen && selectedRevisions.length > 0 && (
        <div className="border rounded-md p-4 bg-gray-50 mb-4">
          <h4 className="font-medium mb-2">
            <EditableText id="compare-revisions-title">
              Compare Revisions
            </EditableText>
          </h4>
          
          <div className="mb-4">
            <h5 className="text-sm font-medium mb-2">
              <EditableText id="layout-options-title">
                Layout options:
              </EditableText>
            </h5>
            
            <div className="grid grid-cols-7 gap-2 mb-3">
              {/* Option 1: one horizontal and two vertical */}
              <button 
                onClick={() => handleLayoutOptionClick(0)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 0 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="One horizontal and two vertical"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                </svg>
              </button>
              
              {/* Option 2: two horizontal and two vertical */}
              <button 
                onClick={() => handleLayoutOptionClick(1)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 1 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="Two horizontal and two vertical"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                  <line x1="12" y1="15" x2="12" y2="21" />
                </svg>
              </button>
              
              {/* Option 3: four vertical */}
              <button 
                onClick={() => handleLayoutOptionClick(2)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 2 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="Four vertical"
              >
                <Columns4 size={24} />
              </button>
              
              {/* Option 4: four horizontal */}
              <button 
                onClick={() => handleLayoutOptionClick(3)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 3 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="Four horizontal"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" />
                  <line x1="3" y1="7.5" x2="21" y2="7.5" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="16.5" x2="21" y2="16.5" />
                </svg>
              </button>
              
              {/* Option 5: four squares within a square */}
              <button 
                onClick={() => handleLayoutOptionClick(4)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 4 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="Four squares within a square"
              >
                <Grid2x2 size={24} />
              </button>
              
              {/* Option 6: two vertical and two horizontal */}
              <button 
                onClick={() => handleLayoutOptionClick(5)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 5 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="Two vertical and two horizontal"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" />
                  <line x1="12" y1="3" x2="12" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" /> 
                  <line x1="3" y1="9" x2="21" y2="9" />                                                      
                </svg>
              </button>
              
              {/* Option 7: two vertical and one horizontal */}
              <button 
                onClick={() => handleLayoutOptionClick(6)}
                className={`border p-2 flex items-center justify-center ${activeLayoutOption === 6 ? 'border-blue-500 bg-blue-50' : ''}`}
                title="Two vertical and one horizontal"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" />
                  <line x1="12" y1="3" x2="12" y2="12" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
              </button>
            </div>
          </div>
          
          <ResizablePanelGroup
            direction="horizontal"
            className="min-h-[200px] max-w-full border rounded"
          >
            <ResizablePanel defaultSize={33}>
              <div className="p-2 h-full bg-white">
                <div className="text-sm font-medium mb-1">
                  <EditableText id="revision-1-title">Revision 1</EditableText>
                </div>
                <div className="text-xs">
                  <p>
                    <EditableText id="revision-1-content-1">
                      Original text content from revision 1.
                    </EditableText>
                  </p>
                  <p>
                    <EditableText id="revision-1-content-2">
                      Additional content from revision 1.
                    </EditableText>
                  </p>
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={67}>
              <div className="p-2 h-full bg-white">
                <div className="text-sm font-medium mb-1">
                  <EditableText id="revision-2-title">Revision 2</EditableText>
                </div>
                <div className="text-xs">
                  <p>
                    <EditableText id="revision-2-content-1">
                      Updated text content from revision 2.
                    </EditableText>
                  </p>
                  <p>
                    <EditableText id="revision-2-content-2">
                      Additional content from revision 2 with changes highlighted.
                    </EditableText>
                  </p>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
};

export default RevisionComparison;
