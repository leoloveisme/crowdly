import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import EditableText from "@/components/EditableText";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AtSign } from "lucide-react";

const Contact = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-tr from-indigo-100 via-pink-50 to-white dark:from-indigo-950 dark:via-slate-950 dark:to-pink-950">
      <CrowdlyHeader />
      <main className="flex-1 container mx-auto px-4 py-12 flex flex-col items-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent">
          <EditableText id="contact-page-title" as="span">Contact Us</EditableText>
        </h1>
        <Card className="w-full max-w-lg rounded-3xl border-pink-200/40 dark:border-indigo-800/60 shadow-xl mt-8">
          <CardHeader className="text-center">
            <CardTitle>
              <EditableText
                id="contact-card-heading"
                as="span"
                className="bg-gradient-to-r from-indigo-900 via-pink-800 to-indigo-400 bg-clip-text text-transparent"
              >
                Write us an email
              </EditableText>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              <EditableText id="contact-card-desc" as="span">
                Questions, feedback, or just want to say hi? Drop us a line.
              </EditableText>
            </p>
            <a
              href="mailto:hello@crowdly.cloud"
              className="font-bold text-lg text-indigo-700 dark:text-indigo-300 hover:text-pink-600 transition inline-flex items-center gap-1"
            >
              hello <AtSign className="h-5 w-5 inline-block" /> crowdly.cloud
            </a>
          </CardContent>
        </Card>
      </main>
      <CrowdlyFooter />
    </div>
  );
};

export default Contact;
