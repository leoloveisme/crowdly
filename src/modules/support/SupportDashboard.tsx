import { Link } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useToast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug, Ticket, MessageSquareText, Lightbulb, UserSearch, Loader2 } from "lucide-react";
import {
  BUG_AREAS,
  BUG_SEVERITIES,
  BUG_STATUSES,
  REQUEST_STATUSES,
  getSupportRequests,
  updateSupportRequestStatus,
  type SupportFilters,
  type SupportKind,
  type SupportStatus,
} from "@/lib/supportApi";
import { AreaLabel, SeverityLabel, StatusLabel } from "./labels";
import SupportRequestCard from "./SupportRequestCard";

const ALL = "__all__";

const FilterSelect = ({
  value,
  onChange,
  allLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: ReactNode;
  children: ReactNode;
}) => (
  <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
    <SelectTrigger className="h-8 w-44">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={ALL}>{allLabel}</SelectItem>
      {children}
    </SelectContent>
  </Select>
);

const RequestList = ({ kind }: { kind: SupportKind }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<SupportFilters>({ kind, status: "", severity: "", area: "" });
  const queryKey = ["support-requests", filters];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => getSupportRequests(filters),
  });

  const mutation = useMutation({
    mutationFn: ({ id, status, duplicateOf }: { id: string; status: SupportStatus; duplicateOf?: string }) =>
      updateSupportRequestStatus(id, status, duplicateOf),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-requests"] }),
    onError: (err) =>
      toast({ variant: "destructive", description: err instanceof Error ? err.message : "Could not update the status." }),
  });

  const statuses = kind === "bug" ? BUG_STATUSES : REQUEST_STATUSES;
  const requests = data?.requests ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          value={filters.status ?? ""}
          onChange={(v) => setFilters((f) => ({ ...f, status: v as SupportStatus }))}
          allLabel={<EditableText id="support-filter-all-statuses">All statuses</EditableText>}
        >
          {statuses.map((s) => (
            <SelectItem key={s} value={s}><StatusLabel status={s} /></SelectItem>
          ))}
        </FilterSelect>
        {kind === "bug" && (
          <>
            <FilterSelect
              value={filters.severity ?? ""}
              onChange={(v) => setFilters((f) => ({ ...f, severity: v as SupportFilters["severity"] }))}
              allLabel={<EditableText id="support-filter-all-severities">All severities</EditableText>}
            >
              {BUG_SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}><SeverityLabel severity={s} /></SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              value={filters.area ?? ""}
              onChange={(v) => setFilters((f) => ({ ...f, area: v as SupportFilters["area"] }))}
              allLabel={<EditableText id="support-filter-all-areas">All areas</EditableText>}
            >
              {BUG_AREAS.map((a) => (
                <SelectItem key={a} value={a}><AreaLabel area={a} /></SelectItem>
              ))}
            </FilterSelect>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : isError ? (
        <EditableText id="support-dashboard-load-error" as="p" className="py-8 text-center text-destructive">
          Could not load the list. Please try again.
        </EditableText>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          {kind === "bug" ? (
            <>
              <Bug className="h-12 w-12 mb-4 opacity-30" />
              <EditableText id="support-bugs-empty" as="p" className="text-lg font-medium">No bug reports</EditableText>
              <EditableText id="support-bugs-empty-detail" as="p" className="text-sm mt-1">Bug reports from users will appear here.</EditableText>
            </>
          ) : (
            <>
              <Ticket className="h-12 w-12 mb-4 opacity-30" />
              <EditableText id="support-enquiries-empty" as="p" className="text-lg font-medium">No support enquiries yet</EditableText>
              <EditableText id="support-enquiries-empty-detail" as="p" className="text-sm mt-1">Support tickets from users will appear here.</EditableText>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <SupportRequestCard
              key={r.id}
              request={r}
              staff
              onStatusChange={async (status, duplicateOf) => {
                await mutation.mutateAsync({ id: r.id, status, duplicateOf });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SupportDashboard = () => (
  <Tabs defaultValue="enquiries">
    <TabsList className="mb-4 flex-wrap h-auto">
      <TabsTrigger value="enquiries" className="flex items-center gap-2">
        <Ticket className="h-4 w-4" /> <EditableText id="support-tab-enquiries">Support Enquiries</EditableText>
      </TabsTrigger>
      <TabsTrigger value="bugs" className="flex items-center gap-2">
        <Bug className="h-4 w-4" /> <EditableText id="support-tab-bugs">Bug Reports</EditableText>
      </TabsTrigger>
      <TabsTrigger value="feedback" className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4" /> <EditableText id="support-tab-feedback">User Feedback</EditableText>
      </TabsTrigger>
      <TabsTrigger value="suggestions" className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4" /> <EditableText id="support-tab-suggestions">Feature Suggestions</EditableText>
      </TabsTrigger>
      <TabsTrigger value="lookup" className="flex items-center gap-2">
        <UserSearch className="h-4 w-4" /> <EditableText id="support-tab-lookup">User Lookup</EditableText>
      </TabsTrigger>
    </TabsList>

    <TabsContent value="enquiries">
      <Card>
        <CardHeader>
          <CardTitle><EditableText id="support-enquiries-title">Support Enquiries</EditableText></CardTitle>
          <CardDescription><EditableText id="support-enquiries-desc">View and manage user support tickets.</EditableText></CardDescription>
        </CardHeader>
        <CardContent>
          <RequestList kind="request" />
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="bugs">
      <Card>
        <CardHeader>
          <CardTitle><EditableText id="support-bugs-title">Bug Reports</EditableText></CardTitle>
          <CardDescription><EditableText id="support-bugs-desc">Triage bugs reported from the web and the desktop app.</EditableText></CardDescription>
        </CardHeader>
        <CardContent>
          <RequestList kind="bug" />
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="feedback">
      <Card>
        <CardHeader>
          <CardTitle><EditableText id="support-feedback-title">User Feedback</EditableText></CardTitle>
          <CardDescription><EditableText id="support-feedback-desc">Review and manage feedback submitted by users.</EditableText></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquareText className="h-12 w-12 mb-4 opacity-30" />
            <EditableText id="support-feedback-empty" as="p" className="text-lg font-medium">No user feedback yet</EditableText>
            <EditableText id="support-feedback-empty-detail" as="p" className="text-sm mt-1">User feedback submissions will appear here.</EditableText>
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="suggestions">
      <Card>
        <CardHeader>
          <CardTitle><EditableText id="support-suggestions-title">Feature Suggestions</EditableText></CardTitle>
          <CardDescription><EditableText id="support-suggestions-desc">Review feature suggestions from users.</EditableText></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Lightbulb className="h-12 w-12 mb-4 opacity-30" />
            <EditableText id="support-suggestions-managed" as="p" className="text-lg font-medium">Feature suggestions are managed on a dedicated page</EditableText>
            <EditableText id="support-suggestions-managed-detail" as="p" className="text-sm mt-1 mb-4">View and manage all feature suggestions in one place.</EditableText>
            <Link to="/feature-suggestions" className="text-indigo-600 hover:text-indigo-800 underline font-medium">
              <EditableText id="support-go-to-suggestions">Go to Feature Suggestions</EditableText>
            </Link>
          </div>
        </CardContent>
      </Card>
    </TabsContent>

    <TabsContent value="lookup">
      <Card>
        <CardHeader>
          <CardTitle><EditableText id="support-lookup-title">User Lookup</EditableText></CardTitle>
          <CardDescription><EditableText id="support-lookup-desc">Search for user accounts to assist them.</EditableText></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UserSearch className="h-12 w-12 mb-4 opacity-30" />
            <EditableText id="support-lookup-empty" as="p" className="text-lg font-medium">User lookup coming soon</EditableText>
            <EditableText id="support-lookup-empty-detail" as="p" className="text-sm mt-1">Search and look up user accounts to provide assistance.</EditableText>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  </Tabs>
);

export default SupportDashboard;
