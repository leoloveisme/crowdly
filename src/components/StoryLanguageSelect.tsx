import React, { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EditableText from "@/components/EditableText";

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? "")
  : "";

interface Locale {
  code: string;
  english_name: string;
  native_name: string | null;
}

interface StoryLanguageSelectProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}

const StoryLanguageSelect: React.FC<StoryLanguageSelectProps> = ({ value, onChange, disabled }) => {
  const [locales, setLocales] = useState<Locale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLocales = async () => {
      try {
        const res = await fetch(`${API_BASE}/locales`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setLocales(data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch locales", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLocales();
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">
        <EditableText id="story-language-label">Language</EditableText>
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={loading ? "Loading..." : "Select language"} />
        </SelectTrigger>
        <SelectContent>
          {locales.map((locale) => (
            <SelectItem key={locale.code} value={locale.code}>
              {locale.english_name}
              {locale.native_name && locale.native_name !== locale.english_name
                ? ` (${locale.native_name})`
                : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default StoryLanguageSelect;
