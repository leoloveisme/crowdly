import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Languages, Star } from "lucide-react";
import EditableText from "@/components/EditableText";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchLocales, type Locale, type StoryTranslations } from "@/lib/translationsApi";

interface LanguageSwitcherProps {
  storyTitleId: string;
  language: string;
  translations: StoryTranslations | null;
  onTranslate: () => void;
  onToggleOfficial: (storyTitleId: string, official: boolean) => void;
}

export function useLocales() {
  const [locales, setLocales] = useState<Locale[]>([]);
  useEffect(() => {
    fetchLocales()
      .then((rows) => setLocales(rows.filter((l) => l.code !== "other")))
      .catch(() => setLocales([]));
  }, []);
  return locales;
}

export const localeName = (locales: Locale[], code: string) => {
  const l = locales.find((x) => x.code === code);
  return l ? l.native_name || l.english_name : code.toUpperCase();
};

/**
 * The story's language badge, doubling as a switcher between the language
 * versions (original + translations) of the story, and the entry point for
 * creating a new translation.
 */
const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  storyTitleId,
  language,
  translations,
  onTranslate,
  onToggleOfficial,
}) => {
  const navigate = useNavigate();
  const locales = useLocales();
  const versions = translations?.versions ?? [];
  const others = versions.filter((v) => v.story_title_id !== storyTitleId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 hover:bg-purple-200"
          title="Languages"
        >
          <Languages className="h-3 w-3" />
          {language.toUpperCase()}
          {others.length > 0 && <span className="text-purple-600">+{others.length}</span>}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="text-xs text-gray-500 font-medium">
          <EditableText id="story-lang-heading">Language versions</EditableText>
        </DropdownMenuLabel>
        {versions.map((v) => {
          const isCurrent = v.story_title_id === storyTitleId;
          const pct = v.chapter_count > 0 ? Math.round((v.translated_count / v.chapter_count) * 100) : 0;
          return (
            <DropdownMenuItem
              key={v.story_title_id}
              onSelect={() => !isCurrent && navigate(`/story/${v.story_title_id}`)}
              className={cn("flex items-start gap-2", isCurrent && "bg-purple-50")}
            >
              <span className="w-4 pt-0.5">{isCurrent && <Check className="h-3.5 w-3.5 text-purple-700" />}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm">
                  {localeName(locales, v.language)}
                  <span className="ml-1 text-xs text-gray-400">{v.language.toUpperCase()}</span>
                </span>
                <span className="block text-[11px] text-gray-500">
                  {v.is_original ? (
                    <EditableText id="story-lang-original">Original</EditableText>
                  ) : v.is_official ? (
                    <EditableText id="story-lang-official">Official translation</EditableText>
                  ) : (
                    <EditableText id="story-lang-community">Community translation</EditableText>
                  )}
                  {!v.is_original && ` · ${pct}%`}
                  {!v.published && (
                    <>
                      {" · "}
                      <EditableText id="story-lang-draft">draft</EditableText>
                    </>
                  )}
                  {v.is_mine && v.stale_count > 0 && (
                    <span className="text-amber-700">
                      {` · ${v.stale_count} `}
                      <EditableText id="story-lang-stale">out of date</EditableText>
                    </span>
                  )}
                  {v.creator_name && !v.is_original && ` · ${v.creator_name}`}
                </span>
              </span>
              {translations?.can_mark_official && !v.is_original && (
                <button
                  type="button"
                  title={v.is_official ? "Unmark as official" : "Mark as the official translation"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleOfficial(v.story_title_id, !v.is_official);
                  }}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <Star className={cn("h-3.5 w-3.5", v.is_official ? "fill-amber-400 text-amber-500" : "text-gray-400")} />
                </button>
              )}
            </DropdownMenuItem>
          );
        })}
        {translations?.can_translate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onTranslate}>
              <Languages className="h-3.5 w-3.5 mr-2" />
              <EditableText id="story-lang-translate">Translate this story…</EditableText>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
