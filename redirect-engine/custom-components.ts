/**
 * Custom Components for Redirect Countdown Page
 * Add your custom HTML/JS components here
 */

export interface CustomComponentsConfig {
  enabled: boolean;
  components: string;
}

/**
 * Default custom components - customize this to add your own branding
 */
export function getCustomComponents(): string {
  // Uncomment and modify any of these examples to customize your redirect page

  return `
    <!-- Example 1: Logo -->
    <div class="custom-logo" style="margin-bottom: 20px;">
      <img src="/logo.png" alt="Logo" style="height: 40px;" onerror="this.style.display='none'">
    </div>

    <!-- Example 2: Social Links -->
    <div class="custom-social" style="display: flex; gap: 16px; justify-content: center; margin-top: 20px;">
      <a href="https://twitter.com" target="_blank" style="color: #a0a0a0;">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
      <a href="https://facebook.com" target="_blank" style="color: #a0a0a0;">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </a>
    </div>

    <!-- Example 3: Footer Text -->
    <div class="custom-footer" style="margin-top: 30px; font-size: 12px; color: #6b7280;">
      Powered by Redirect Platform
    </div>

    <!-- Example 4: Custom Banner (uncomment to use) -->
    <!--
    <div class="custom-banner" style="background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; font-weight: 600;">Special Offer! 50% off for new users</p>
    </div>
    -->

    <!-- Example 5: Analytics/Tracking (uncomment to use) -->
    <!--
    <script>
      console.log('Redirect page loaded - track this event in your analytics');
    </script>
    -->
  `;
}

/**
 * Add custom components to the countdown HTML
 */
export function injectCustomComponents(html: string): string {
  const customComponents = getCustomComponents();
  return html.replace(
    '<div class="custom-components" id="custom-components">',
    `<div class="custom-components" id="custom-components">${customComponents}`
  );
}