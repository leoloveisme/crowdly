import React, { createContext, useContext, useState } from "react";

interface AlphaContextType {
  isAlphaValidated: boolean;
  validateCode: (code: string, email: string) => Promise<boolean>;
  clearAlphaAccess: () => void;
}

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

const ALPHA_CODE_KEY = "crowdly_alpha_code";
const ALPHA_EMAIL_KEY = "crowdly_alpha_email";

const AlphaContext = createContext<AlphaContextType | undefined>(undefined);

export const AlphaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAlphaValidated, setIsAlphaValidated] = useState<boolean>(() => {
    return !!sessionStorage.getItem(ALPHA_CODE_KEY) && !!sessionStorage.getItem(ALPHA_EMAIL_KEY);
  });

  const validateCode = async (code: string, email: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/alpha/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      if (data.valid) {
        sessionStorage.setItem(ALPHA_CODE_KEY, code);
        sessionStorage.setItem(ALPHA_EMAIL_KEY, email);
        setIsAlphaValidated(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Alpha validation failed:", err);
      return false;
    }
  };

  const clearAlphaAccess = () => {
    sessionStorage.removeItem(ALPHA_CODE_KEY);
    sessionStorage.removeItem(ALPHA_EMAIL_KEY);
    setIsAlphaValidated(false);
  };

  return (
    <AlphaContext.Provider value={{ isAlphaValidated, validateCode, clearAlphaAccess }}>
      {children}
    </AlphaContext.Provider>
  );
};

export const useAlpha = () => {
  const context = useContext(AlphaContext);
  if (context === undefined) {
    throw new Error("useAlpha must be used within an AlphaProvider");
  }
  return context;
};
