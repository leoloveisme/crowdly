import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EditableText from "@/components/EditableText";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Bug, Download, Lightbulb, LifeBuoy, Loader2, Mail, MessageSquareText } from "lucide-react";
import { getMySupportRequests } from "@/lib/supportApi";
import SupportRequestForm from "./SupportRequestForm";
import BugReportForm from "./BugReportForm";
import SupportRequestCard from "./SupportRequestCard";

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

const FAQ: FaqEntry[] = [
  {
    id: "access",
    question: "How do I get access to Crowdly during the alpha?",
    answer:
      "Crowdly is currently in its alpha stage, so access is by invitation. If you have an invitation code, enter it together with your email address on the alpha page. If you don't have one yet, send us a request below and tell us a little about what you'd like to create or explore.",
  },
  {
    id: "start-story",
    question: "How do I start a new story?",
    answer:
      "Sign in and choose to create a new story from the header or from My Content. Give it a title, add your first chapter and decide who can see it. You can keep a story private while you work on it and make it public whenever you're ready.",
  },
  {
    id: "branches",
    question: "What are branches and versions?",
    answer:
      "Every story keeps its history, so you can look back at earlier versions of a chapter. A branch lets a story take a different direction without erasing the original: another ending, another point of view or a single changed decision. Readers can follow the version that interests them.",
  },
  {
    id: "desktop",
    question: "What is the desktop app, and what's the difference between Discovery and Creation?",
    answer:
      "The Crowdly desktop app is a native editor for stories and screenplays. Discovery mode is for finding, reading and collecting stories; Creation mode is a focused writing environment. It's one app: you choose which mode it starts in and can switch at any time. Downloads are on the Apps and software page.",
  },
  {
    id: "spaces",
    question: "How do Creative Spaces sync with GitHub or Google Drive?",
    answer:
      "A Creative Space is a collection of your files and projects. You can connect a Space to a GitHub repository or a Google Drive folder, and Crowdly keeps them in sync, so you can keep working in the tools you already use. Hidden and git-ignored files are left out of the sync.",
  },
  {
    id: "language",
    question: "Can I use Crowdly in my language?",
    answer:
      "Yes. Choose your language from the selector in the header. Crowdly's interface is translated by our team and community translators; anything that isn't translated yet is shown in English. Stories themselves can also have versions in several languages.",
  },
  {
    id: "privacy",
    question: "How do I change my account details or delete my account?",
    answer:
      "Open Account settings from the menu under your avatar. There you can change your password and other details, or delete your account permanently. If something there doesn't work as expected, send us a support request.",
  },
];

type FormTab = "request" | "bug";

const QuickLink = ({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) => (
  <Link
    to={to}
    className="flex items-center gap-3 rounded-2xl border border-pink-200/50 dark:border-indigo-800/60 bg-white/80 dark:bg-indigo-950/40 p-4 shadow-sm transition hover:shadow-md hover:border-pink-300"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-100 to-pink-100 dark:from-indigo-900 dark:to-pink-900 text-indigo-700 dark:text-indigo-200">
      {icon}
    </span>
    <span className="font-medium text-indigo-900 dark:text-indigo-100">{children}</span>
  </Link>
);

const SupportHelpCenter = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const formsRef = useRef<HTMLDivElement>(null);
  const typeParam = searchParams.get("type");
  const [formTab, setFormTab] = useState<FormTab>(typeParam === "bug" ? "bug" : "request");

  // ?type=bug / ?type=request (footer, header menu, desktop app) jump straight to the form.
  useEffect(() => {
    if (typeParam === "bug" || typeParam === "request") {
      setFormTab(typeParam);
      formsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [typeParam]);

  const selectForm = (tab: FormTab) => {
    setFormTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set("type", tab);
    setSearchParams(next, { replace: true });
  };

  const mine = useQuery({
    queryKey: ["support-requests", "mine"],
    queryFn: getMySupportRequests,
    enabled: !!user,
  });
  const refreshMine = () => queryClient.invalidateQueries({ queryKey: ["support-requests", "mine"] });

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
      active
        ? "bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow"
        : "bg-white/70 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
    }`;

  return (
    <div className="space-y-12">
      <section className="text-center pt-4">
        <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 dark:from-indigo-200 dark:via-pink-300 dark:to-indigo-300 bg-clip-text text-transparent">
          <EditableText id="support-hero-title">How can we help?</EditableText>
        </h1>
        <EditableText id="support-hero-intro" as="p" className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Find quick answers below, ask our team for help, or let us know about a bug so we can fix it.
        </EditableText>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <QuickLink to="/contact" icon={<Mail className="h-5 w-5" />}>
          <EditableText id="support-quick-contact">Contact us</EditableText>
        </QuickLink>
        <QuickLink to="/feedback" icon={<MessageSquareText className="h-5 w-5" />}>
          <EditableText id="support-quick-feedback">Send feedback</EditableText>
        </QuickLink>
        <QuickLink to="/suggest-feature" icon={<Lightbulb className="h-5 w-5" />}>
          <EditableText id="support-quick-feature">Suggest a feature</EditableText>
        </QuickLink>
        <QuickLink to="/software" icon={<Download className="h-5 w-5" />}>
          <EditableText id="support-quick-software">Apps and software</EditableText>
        </QuickLink>
        <button type="button" onClick={() => selectForm("bug")} className="text-left">
          <span className="flex items-center gap-3 rounded-2xl border border-pink-200/50 dark:border-indigo-800/60 bg-white/80 dark:bg-indigo-950/40 p-4 shadow-sm transition hover:shadow-md hover:border-pink-300">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-100 to-pink-100 dark:from-indigo-900 dark:to-pink-900 text-indigo-700 dark:text-indigo-200">
              <Bug className="h-5 w-5" />
            </span>
            <span className="font-medium text-indigo-900 dark:text-indigo-100">
              <EditableText id="support-quick-bug">Report a bug</EditableText>
            </span>
          </span>
        </button>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-indigo-900 dark:text-indigo-100 mb-4">
          <EditableText id="support-faq-title">Frequently asked questions</EditableText>
        </h2>
        <Card className="rounded-3xl border-pink-200/40 dark:border-indigo-800/60">
          <CardContent className="pt-2">
            <Accordion type="single" collapsible>
              {FAQ.map((entry) => (
                <AccordionItem key={entry.id} value={entry.id}>
                  <AccordionTrigger className="text-left">
                    <EditableText id={`support-faq-${entry.id}-q`}>{entry.question}</EditableText>
                  </AccordionTrigger>
                  <AccordionContent>
                    <EditableText id={`support-faq-${entry.id}-a`} as="p" className="text-muted-foreground leading-relaxed">
                      {entry.answer}
                    </EditableText>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </section>

      <section ref={formsRef} className="scroll-mt-24">
        <h2 className="text-2xl font-semibold text-indigo-900 dark:text-indigo-100 mb-4">
          <EditableText id="support-forms-title">Still need help?</EditableText>
        </h2>
        <div className="flex flex-wrap gap-2 mb-4" role="tablist">
          <button type="button" role="tab" aria-selected={formTab === "request"} onClick={() => selectForm("request")} className={tabClass(formTab === "request")}>
            <LifeBuoy className="h-4 w-4" />
            <EditableText id="support-form-tab-request">Ask for help</EditableText>
          </button>
          <button type="button" role="tab" aria-selected={formTab === "bug"} onClick={() => selectForm("bug")} className={tabClass(formTab === "bug")}>
            <Bug className="h-4 w-4" />
            <EditableText id="support-form-tab-bug">Report a bug</EditableText>
          </button>
        </div>
        <Card className="rounded-3xl border-pink-200/40 dark:border-indigo-800/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">
              {formTab === "bug" ? (
                <EditableText id="support-bug-heading">Report a bug</EditableText>
              ) : (
                <EditableText id="support-request-heading">Send a support request</EditableText>
              )}
            </CardTitle>
            {formTab === "bug" ? (
              <EditableText id="support-bug-intro" as="p" className="text-sm text-muted-foreground">
                The more detail you give us, the faster we can find and fix it.
              </EditableText>
            ) : (
              <EditableText id="support-request-intro" as="p" className="text-sm text-muted-foreground">
                Tell us what you need and we'll get back to you by email.
              </EditableText>
            )}
          </CardHeader>
          <CardContent>
            {formTab === "bug" ? (
              <BugReportForm onSubmitted={refreshMine} />
            ) : (
              <SupportRequestForm onSubmitted={refreshMine} />
            )}
          </CardContent>
        </Card>
      </section>

      {user && (
        <section>
          <h2 className="text-2xl font-semibold text-indigo-900 dark:text-indigo-100 mb-4">
            <EditableText id="support-mine-title">My requests & reports</EditableText>
          </h2>
          {mine.isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (mine.data?.requests ?? []).length === 0 ? (
            <EditableText id="support-mine-empty" as="p" className="text-muted-foreground">
              You haven't sent any support requests or bug reports yet.
            </EditableText>
          ) : (
            <div className="space-y-3">
              {mine.data!.requests.map((r) => (
                <SupportRequestCard key={r.id} request={r} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default SupportHelpCenter;
