
import React, { useEffect, useRef, useState } from 'react';

interface ReCaptchaProps {
  siteKey: string;
  onChange: (token: string | null) => void;
}

declare global {
  interface Window {
    grecaptcha: {
      render: (
        container: HTMLElement | string,
        parameters: {
          sitekey: string;
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark';
          size?: 'normal' | 'compact' | 'invisible';
        }
      ) => number;
      reset: (widgetId?: number) => void;
      execute: (widgetId?: number) => void;
      ready: (callback: () => void) => void;
    };
  }
}

const ReCaptcha: React.FC<ReCaptchaProps> = ({ siteKey, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const captchaId = useRef<number | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const scriptLoadedRef = useRef<boolean>(false);
  const retryAttemptsRef = useRef<number>(0);
  const maxRetryAttempts = 3;

  useEffect(() => {
    // Only proceed if we have a valid site key
    if (!siteKey || siteKey.trim() === '') {
      setHasError(true);
      setErrorMessage("reCAPTCHA site key is missing");
      return;
    }

    // Reset error state when site key changes
    setHasError(false);
    setErrorMessage("");
    retryAttemptsRef.current = 0;
    
    // Create script element if it doesn't exist
    if (!document.querySelector('script[src*="recaptcha/api.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        scriptLoadedRef.current = true;
        initializeCaptcha();
      };
      script.onerror = () => {
        console.error("Failed to load reCAPTCHA script");
        setHasError(true);
        setErrorMessage("Failed to load reCAPTCHA script");
      };
      document.head.appendChild(script);
    } else if (!scriptLoadedRef.current) {
      scriptLoadedRef.current = true;
      initializeCaptcha();
    }
    
    // Handle script already loaded case
    if (window.grecaptcha && window.grecaptcha.render) {
      scriptLoadedRef.current = true;
      initializeCaptcha();
    }

    function initializeCaptcha() {
      // Only proceed if the script is loaded and the component is still mounted
      if (!scriptLoadedRef.current) return;
      
      const renderCaptcha = () => {
        // Special handling for Google's test key
        if (siteKey === '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI') {
          console.log("Using Google's test reCAPTCHA key - this will always show an 'Invalid site key' error in production");
        }
        
        if (window.grecaptcha && window.grecaptcha.render && containerRef.current) {
          try {
            // Reset if already rendered
            if (captchaId.current !== null) {
              try {
                window.grecaptcha.reset(captchaId.current);
                setHasError(false);
                setErrorMessage("");
              } catch (resetError) {
                console.error('Error resetting reCAPTCHA:', resetError);
                // Re-render if reset fails
                captchaId.current = null;
                
                // Increment retry attempts
                retryAttemptsRef.current += 1;
                if (retryAttemptsRef.current <= maxRetryAttempts) {
                  setTimeout(renderCaptcha, 100);
                } else {
                  setHasError(true);
                  setErrorMessage("Failed to reset reCAPTCHA after multiple attempts");
                }
              }
            } else {
              // Render new captcha
              captchaId.current = window.grecaptcha.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => {
                  setHasError(false);
                  setErrorMessage("");
                  onChange(token);
                },
                'expired-callback': () => onChange(null),
                'error-callback': () => {
                  console.error("reCAPTCHA encountered an error");
                  
                  // Don't show error for test key as it's expected
                  if (siteKey !== '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI') {
                    setHasError(true);
                    setErrorMessage("reCAPTCHA validation failed. Please try again.");
                  }
                  
                  onChange(null);
                }
              });
            }
          } catch (error) {
            console.error('Error rendering reCAPTCHA:', error);
            
            // Increment retry attempts
            retryAttemptsRef.current += 1;
            if (retryAttemptsRef.current <= maxRetryAttempts) {
              setTimeout(renderCaptcha, 500);
            } else {
              setHasError(true);
              setErrorMessage("Failed to initialize reCAPTCHA after multiple attempts");
            }
          }
        } else if (window.grecaptcha) {
          // If grecaptcha exists but render method is not ready yet
          setTimeout(renderCaptcha, 100);
        } else {
          // If grecaptcha doesn't exist yet
          setTimeout(renderCaptcha, 500);
        }
      };

      // Use grecaptcha.ready if available, otherwise use our custom rendering logic
      if (window.grecaptcha && window.grecaptcha.ready) {
        window.grecaptcha.ready(() => {
          renderCaptcha();
        });
      } else {
        setTimeout(renderCaptcha, 500);
      }
    }

    return () => {
      // Clean up if component unmounts
      if (captchaId.current !== null && window.grecaptcha && window.grecaptcha.reset) {
        try {
          window.grecaptcha.reset(captchaId.current);
        } catch (error) {
          console.error("Error during cleanup:", error);
        }
      }
    };
  }, [siteKey, onChange]);

  return (
    <div className="recaptcha-container">
      <div ref={containerRef}></div>
      {hasError && (
        <div className="mt-2 text-red-500 text-sm">
          {errorMessage || "There was an error with reCAPTCHA. Please refresh and try again."}
          {siteKey === '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI' && (
            <div className="mt-1 text-amber-500">
              Note: You're using Google's test key which always shows "Invalid site key" in production.
              Please replace it with your actual reCAPTCHA site key.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReCaptcha;
