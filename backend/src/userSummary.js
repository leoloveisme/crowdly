// Shared shape for "who is this" across friends/messaging/notifications
// responses, so display-name fallback logic lives in one place instead of
// being re-derived per route (it already exists once, slightly differently,
// in the /search and /users/search handlers).
export function toUserSummary(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.username || row.profile_page_name || row.email || 'User',
  };
}

export const USER_SUMMARY_SELECT = 'u.id, u.email, p.username, p.profile_page_name';
export const USER_SUMMARY_JOIN = 'LEFT JOIN profiles p ON p.id = u.id';
