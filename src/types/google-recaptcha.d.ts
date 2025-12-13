
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
