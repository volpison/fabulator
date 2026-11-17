/**
 * What a platform can do, so the screen can hide what it cannot instead of
 * checking "is this Android?" in components.
 *
 * Pure (no Tauri): `detectCapabilities` takes the browser's user-agent text.
 */
export type Capabilities = {
  /** Can pick a folder and read/write many files in it (Markdown folder, theme folders). */
  folders: boolean;
  /** Has a window close button the app can intercept. Android apps are paused or killed instead. */
  windowClose: boolean;
  /**
   * Projects are private working copies: **Open** copies a picked file in, and **Save a copy to your
   * device** writes one out (Android; see docs/technical/android.md). "Save as…" is not offered.
   */
  deviceCopies: boolean;
};

export const DESKTOP_CAPABILITIES: Capabilities = { folders: true, windowClose: true, deviceCopies: false };
export const ANDROID_CAPABILITIES: Capabilities = { folders: false, windowClose: false, deviceCopies: true };

export function detectCapabilities(userAgent: string): Capabilities {
  return /\bAndroid\b/i.test(userAgent) ? ANDROID_CAPABILITIES : DESKTOP_CAPABILITIES;
}
