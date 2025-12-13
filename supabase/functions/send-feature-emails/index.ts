
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resend = new Resend(resendApiKey);

const adminEmail = "mayleoforcebewithyou@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FeatureSuggestionEmailRequest {
  visibility: "public" | "private" | "anonymous";
  firstName?: string;
  lastName?: string;
  email?: string;
  suggestionId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { visibility, firstName, lastName, email, suggestionId } = 
      await req.json() as FeatureSuggestionEmailRequest;
    
    console.log("Received request to send emails for feature suggestion:", suggestionId);
    console.log("Request data:", { visibility, firstName, lastName, email });

    // Send admin notification email
    let adminEmailSubject = "";
    let adminEmailHtml = "";

    if (visibility === "anonymous") {
      adminEmailSubject = "New Anonymous Feature Suggestion";
      adminEmailHtml = `
        <h1>New Anonymous Feature Suggestion</h1>
        <p>Someone has just sent a new feature suggestion.</p>
        <p><a href="https://crowdly.app/feature-suggestions/${suggestionId}">Click here</a> to see the suggestion on the Crowdly platform.</p>
      `;
    } else {
      const userName = visibility === "public" ? `${firstName} ${lastName}` : "user";
      adminEmailSubject = "New Feature Suggestion";
      adminEmailHtml = `
        <h1>New Feature Suggestion</h1>
        <p>${userName} has sent a new feature suggestion.</p>
        <p><a href="https://crowdly.app/feature-suggestions/${suggestionId}">Click here</a> to see the suggestion on the Crowdly platform.</p>
      `;
    }

    const adminEmailPromise = resend.emails.send({
      from: "Crowdly <notifications@crowdly.app>",
      to: [adminEmail],
      subject: adminEmailSubject,
      html: adminEmailHtml,
    });

    // Send user confirmation email if not anonymous or if email provided
    let userEmailPromise = Promise.resolve(null);
    
    if (email && (visibility === "public" || visibility === "private")) {
      userEmailPromise = resend.emails.send({
        from: "Crowdly <notifications@crowdly.app>",
        to: [email],
        subject: "Thank you for your feature suggestion",
        html: `
          <h1>Thank you for your suggestion</h1>
          <p>We appreciate your suggestion and the time you took to send it to us a lot.</p>
          <p>The Crowdly Team</p>
        `,
      });
    }

    // Wait for both emails to be sent
    const [adminEmailResult, userEmailResult] = await Promise.all([
      adminEmailPromise,
      userEmailPromise
    ]);

    console.log("Admin email result:", adminEmailResult);
    console.log("User email result:", userEmailResult);

    return new Response(
      JSON.stringify({ 
        success: true,
        adminEmail: adminEmailResult,
        userEmail: userEmailResult
      }),
      {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  } catch (error) {
    console.error("Error sending feature suggestion emails:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);
