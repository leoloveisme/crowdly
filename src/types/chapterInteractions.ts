
export interface ChapterComment {
  id: string;
  chapter_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface ChapterLike {
  id: string;
  chapter_id: string;
  user_id: string;
  is_like: boolean;
  created_at: string;
}

export interface ChapterContributor {
  id: string;
  chapter_id: string;
  user_id: string;
  added_by?: string | null;
  created_at: string;
}
