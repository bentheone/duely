# Duely brand kit — "Dot"

Colours: Ink #111317 · White #FFFFFF · Paper #F6F6F3 · Accent (light bg) #EA580C · Accent (dark bg) #F97316
Font: Space Grotesk SemiBold (600), lowercase "duely", letter-spacing -4% (outlined in the logo SVGs).
Mark: big dot (centre 44,56 r22) + small accent dot (centre 72,30 r9) on a 100×100 grid.

## Expo (app.config.ts)
- icon: ./assets/brand/expo/icon.png
- android.adaptiveIcon: foregroundImage ./assets/brand/expo/adaptive-icon-foreground.png, monochromeImage ./assets/brand/expo/adaptive-icon-monochrome.png, backgroundColor "#111317"
- splash (expo-splash-screen plugin): image ./assets/brand/expo/splash-icon.png, backgroundColor "#FFFFFF", imageWidth 160; dark: image ./assets/brand/expo/splash-icon-dark.png, backgroundColor "#0E0F12"
- expo-notifications plugin: icon ./assets/brand/expo/notification-icon.png, color "#EA580C"
- web.favicon: ./assets/brand/expo/favicon.png

## Store
- Google Play hi-res icon: store/play-store-icon-512.png (full-bleed square; Play applies the mask)

## Rules
- Keep clear space of one small-dot diameter around the mark.
- Mark min size 16 px; logo min width 80 px.
- On dark backgrounds use the white versions (accent becomes #F97316).
