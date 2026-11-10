/** True when Supabase has just sent someone back from an email link (confirm, reset), with tokens or an error in the URL. */
export const isAuthCallbackHash = (hash = location.hash) =>
  /(^#|&)(access_token|error_code|error_description)=/.test(hash);

/** Where email links (confirm, reset) send people back to: this site's own address. */
export const authReturnUrl = () => `${location.origin}${location.pathname}`;
