import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Info, AlertTriangle, Eye, EyeOff, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import CrowdlyHeader from "@/components/CrowdlyHeader";
import CrowdlyFooter from "@/components/CrowdlyFooter";
import ReCaptcha from "@/components/ReCaptcha";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Attachment {
  id: number;
  name: string;
  type: string;
  file?: File;
}

const RECAPTCHA_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"; // Test key provided by Google for development

const SuggestFeature = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [visibilityOption, setVisibilityOption] = useState<string>("public");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [telephone, setTelephone] = useState<string>("");
  const [canContact, setCanContact] = useState<string>("");
  const [contactMethod, setContactMethod] = useState<string>("");
  const [createAccount, setCreateAccount] = useState<string>("no");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [featureDescription, setFeatureDescription] = useState<string>("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showEmptyFormAlert, setShowEmptyFormAlert] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  const resetForm = () => {
    setVisibilityOption("public");
    setFirstName("");
    setLastName("");
    setEmail("");
    setTelephone("");
    setCanContact("");
    setContactMethod("");
    setCreateAccount("no");
    setPassword("");
    setFeatureDescription("");
    setAttachments([]);
    setCaptchaToken(null);
    setFormErrors({});
    
    // Reset reCAPTCHA if window.grecaptcha is available
    if (window.grecaptcha) {
      try {
        window.grecaptcha.reset();
      } catch (error) {
        console.error("Error resetting reCAPTCHA:", error);
      }
    }
  };
  
  const handleCaptchaChange = (token: string | null) => {
    setCaptchaToken(token);
    
    // Clear captcha error if token is valid
    if (token) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.captcha;
        return newErrors;
      });
    }
  };
  
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFile = files[0];
      
      // Validate file size (max 5MB)
      if (newFile.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 5MB",
          variant: "destructive",
        });
        return;
      }
      
      const newAttachment: Attachment = {
        id: Date.now(),
        name: newFile.name,
        type: newFile.name.split('.').pop() || "",
        file: newFile
      };
      
      setAttachments([...attachments, newAttachment]);
      toast({
        title: "File uploaded",
        description: `${newFile.name} has been attached`,
      });
    }
  };
  
  const deleteAttachment = (id: number) => {
    setAttachments(attachments.filter(attachment => attachment.id !== id));
  };
  
  const validateForm = () => {
    const errors: Record<string, string> = {};
    let hasValue = false;
    
    // Check if form is completely empty
    if (
      !featureDescription && 
      !firstName && 
      !lastName && 
      !email && 
      !telephone && 
      attachments.length === 0
    ) {
      setShowEmptyFormAlert(true);
      return { isValid: false, hasValue: false, errors };
    }
    
    // Required fields for all visibility options
    if (!featureDescription) {
      errors.description = "Feature description is required";
    } else {
      hasValue = true;
    }
    
    // CAPTCHA validation
    if (!captchaToken) {
      errors.captcha = "Please complete the CAPTCHA";
    }
    
    // Additional fields based on visibility option
    if (visibilityOption === "public" || visibilityOption === "private") {
      if (!firstName) {
        errors.firstName = "First name is required";
      } else {
        hasValue = true;
      }
      
      if (!lastName) {
        errors.lastName = "Last name is required";
      } else {
        hasValue = true;
      }
      
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.email = "Please enter a valid email address";
        } else {
          hasValue = true;
        }
      }
    }
    
    // Password validation if creating account
    if (createAccount === "yes" && !password) {
      errors.password = "Password is required to create an account";
    }
    
    setFormErrors(errors);
    return { 
      isValid: Object.keys(errors).length === 0, 
      hasValue,
      errors 
    };
  };
  
  const uploadAttachments = async () => {
    const uploadPromises = attachments
      .filter(attachment => attachment.file)
      .map(async attachment => {
        if (!attachment.file) return null;
        
        const fileName = `${Date.now()}_${attachment.name}`;
        const { data, error } = await supabase.storage
          .from('feature_attachments')
          .upload(fileName, attachment.file);
          
        if (error) {
          console.error("Error uploading file:", error);
          return null;
        }
        
        return {
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          path: data.path
        };
      });
      
    const results = await Promise.all(uploadPromises);
    return results.filter(Boolean);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { isValid, hasValue } = validateForm();
    
    if (!hasValue) {
      return; // Empty form alert is already shown in validateForm
    }
    
    if (!isValid) {
      toast({
        title: "Form Validation Error",
        description: "Please fix the errors in the form before submitting",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // Upload attachments if any
      const uploadedAttachments = attachments.length > 0 
        ? await uploadAttachments() 
        : [];
        
      // Insert suggestion into database
      const { data: suggestion, error: insertError } = await supabase
        .from('feature_suggestions')
        .insert({
          user_id: user?.id || null,
          first_name: visibilityOption !== 'anonymous' ? firstName : null,
          last_name: visibilityOption !== 'anonymous' ? lastName : null,
          email: visibilityOption !== 'anonymous' ? email : null,
          telephone: visibilityOption !== 'anonymous' ? telephone : null,
          can_contact: canContact === 'yes',
          contact_method: canContact === 'yes' ? contactMethod : null,
          description: featureDescription,
          visibility: visibilityOption as any,
          attachments: uploadedAttachments.length > 0 ? uploadedAttachments : null
        })
        .select()
        .single();
        
      if (insertError) {
        throw insertError;
      }
      
      // Send notification emails
      const { data: emailResult, error: emailError } = await supabase.functions.invoke(
        'send-feature-emails',
        {
          body: {
            visibility: visibilityOption,
            firstName,
            lastName,
            email,
            suggestionId: suggestion.id
          }
        }
      );
      
      if (emailError) {
        console.error("Error sending emails:", emailError);
      }
      
      toast({
        title: "Feature suggestion submitted",
        description: "Thank you for your suggestion!",
      });
      
      // Reset form
      resetForm();
      
      // Redirect to feature suggestions list if public or anonymous
      if (visibilityOption === 'public' || visibilityOption === 'anonymous') {
        navigate('/feature-suggestions');
      }
      
    } catch (error) {
      console.error("Error submitting suggestion:", error);
      toast({
        title: "Error submitting suggestion",
        description: "An error occurred while submitting your suggestion. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <CrowdlyHeader />
      
      <div className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-4xl font-bold text-center mb-2 text-[#1A1F2C]">Suggest a feature</h1>
        
        <div className="bg-black text-white text-center text-sm py-1 px-4 rounded mb-4">
          Your suggestion will be published on our website
        </div>
        
        <div className="mb-6 text-center text-gray-500 text-sm">
          Your feature request will be published on our website.
        </div>
        
        <form onSubmit={handleSubmit}>
          {/* Visibility Options */}
          <div className="flex justify-center space-x-6 mb-6">
            <div className="flex items-center">
              <input
                type="radio"
                id="public"
                checked={visibilityOption === "public"}
                onChange={() => setVisibilityOption("public")}
                className="mr-1"
              />
              <label htmlFor="public" className="mr-1">Public</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={16} className="text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Your suggestion will be visible to everyone</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="flex items-center">
              <input
                type="radio"
                id="anonymous"
                checked={visibilityOption === "anonymous"}
                onChange={() => setVisibilityOption("anonymous")}
                className="mr-1"
              />
              <label htmlFor="anonymous" className="mr-1">Anonymous</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={16} className="text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Your name won't be displayed</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="flex items-center">
              <input
                type="radio"
                id="private"
                checked={visibilityOption === "private"}
                onChange={() => setVisibilityOption("private")}
                className="mr-1"
              />
              <label htmlFor="private" className="mr-1">Private</label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={16} className="text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Only administrators will see this suggestion</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          
          {/* Name Fields - Conditionally rendered */}
          {visibilityOption !== "anonymous" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input 
                  id="firstName"
                  type="text" 
                  placeholder="Input text" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={`mt-1 ${formErrors.firstName ? 'border-red-500' : ''}`}
                />
                {formErrors.firstName && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.firstName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input 
                  id="lastName"
                  type="text" 
                  placeholder="Input text" 
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={`mt-1 ${formErrors.lastName ? 'border-red-500' : ''}`}
                />
                {formErrors.lastName && (
                  <p className="text-red-500 text-sm mt-1">{formErrors.lastName}</p>
                )}
              </div>
            </div>
          )}
          
          {/* Contact Information Section - Conditionally rendered */}
          {visibilityOption !== "anonymous" && (
            <div className="bg-gray-200 p-4 rounded mb-6">
              <div className="text-gray-700 mb-4">
                This section won't be displayed on the feature suggestion output page
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email"
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`mt-1 ${formErrors.email ? 'border-red-500' : ''}`}
                  />
                  {formErrors.email && (
                    <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="telephone">Telephone</Label>
                  <Input 
                    id="telephone"
                    type="tel" 
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <Label className="block mb-2">Can we contact you? (in case we have questions)</Label>
                <RadioGroup value={canContact} onValueChange={setCanContact} className="flex space-x-4">
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="yes" id="yes" />
                    <Label htmlFor="yes">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="no" id="no" />
                    <Label htmlFor="no">No</Label>
                  </div>
                </RadioGroup>
              </div>
              
              {canContact === "yes" && (
                <div className="mb-4">
                  <Label className="block mb-2">What is your preferred way of contacting you?</Label>
                  <div className="flex space-x-4">
                    <div className="flex items-center space-x-1">
                      <Checkbox id="contactEmail" checked={contactMethod === "email"} onCheckedChange={() => setContactMethod("email")} />
                      <Label htmlFor="contactEmail">Email</Label>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Checkbox id="contactPhone" checked={contactMethod === "telephone"} onCheckedChange={() => setContactMethod("telephone")} />
                      <Label htmlFor="contactPhone">Telephone</Label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Account Creation Section - Conditionally rendered */}
          {visibilityOption !== "anonymous" && (
            <div className="mb-6">
              <div className="flex items-center mb-2">
                <Label htmlFor="createAccount" className="mr-2">Would you like to create an account?</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info size={16} className="text-gray-400 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>You can create an account on this platform</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select value={createAccount} onValueChange={setCreateAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="No" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
                
                {createAccount === "yes" && (
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-grow">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={formErrors.password ? 'border-red-500' : ''}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button>Save</Button>
                  </div>
                )}
              </div>
              {formErrors.password && (
                <p className="text-red-500 text-sm mt-1">{formErrors.password}</p>
              )}
            </div>
          )}
          
          {visibilityOption !== "anonymous" && (
            <div className="mb-2">
              <p className="text-sm">
                In case you already have an account you can{" "}
                <a href="/login" className="text-blue-500">Login</a>
              </p>
            </div>
          )}
          
          {/* Feature Description */}
          <div className="mb-6">
            <Label htmlFor="featureDescription" className="block mb-2">
              Please describe the feature you're suggesting here
            </Label>
            <Textarea
              id="featureDescription"
              value={featureDescription}
              onChange={(e) => setFeatureDescription(e.target.value)}
              rows={6}
              className={`w-full ${formErrors.description ? 'border-red-500' : ''}`}
            />
            {formErrors.description && (
              <p className="text-red-500 text-sm mt-1">{formErrors.description}</p>
            )}
          </div>
          
          {/* Attachments */}
          <div className="mb-6">
            <Label className="block mb-2">Attachments</Label>
            <div className="flex items-center mb-4">
              <Input className="w-auto mr-2" readOnly onClick={handleFileUpload} />
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileChange} 
              />
              <Button type="button" onClick={handleFileUpload} className="bg-blue-500 hover:bg-blue-600">
                Add
              </Button>
            </div>
            
            <div className="space-y-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex justify-between items-center">
                  <div>
                    <span className="mr-2">{attachment.id}.</span>
                    <span>{attachment.name}</span>
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="text-blue-500 hover:text-blue-700"
                    onClick={() => deleteAttachment(attachment.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </div>
          
          {/* CAPTCHA */}
          <div className="mb-6">
            <ReCaptcha siteKey={RECAPTCHA_SITE_KEY} onChange={handleCaptchaChange} />
            {formErrors.captcha && (
              <p className="text-red-500 text-sm mt-1">{formErrors.captcha}</p>
            )}
            {RECAPTCHA_SITE_KEY === "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI" && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                <strong>Developer Note:</strong> You're using Google's test reCAPTCHA key. 
                Replace it with your actual site key from the Google reCAPTCHA admin console before deployment.
              </div>
            )}
          </div>
          
          {/* Submit Button */}
          <div className="mb-6">
            <Button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </Button>
          </div>
          
          {/* Form Instructions */}
          <div className="mb-6">
            <div className="flex items-center mb-1">
              <span className="mr-2">None of the fields is compulsory</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={16} className="text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Only password field is the exception, providing you choose Yes and decide to create an account on this platform</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-gray-500 text-sm">
              If you try to send an empty form it won't send.
            </p>
          </div>
        </form>
      </div>
      
      <CrowdlyFooter />
      
      {/* Empty Form Alert Dialog */}
      <AlertDialog open={showEmptyFormAlert} onOpenChange={setShowEmptyFormAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
              Empty Form
            </AlertDialogTitle>
            <AlertDialogDescription>
              You haven't entered any data. Please fill out at least one field to submit the form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuggestFeature;
