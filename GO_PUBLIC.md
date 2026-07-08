# Taking Wavecairn public (no App Store, no Play Store)

Three ways people get the app, all from the same codebase:

| Audience | How they get it |
|---|---|
| Everyone | Public website link (works in any browser) |
| iPhone | Same link → Safari → **Add to Home Screen** (installs as a PWA) |
| Android | Same link → Chrome **Install app**, *or* a sideloaded APK you share |

The app is already a full PWA: manifest, icons, service worker, offline shell,
and iOS install metas are baked into every `npm run build:web`.

---

## 1. Deploy the public website (free, Render)

The repo already contains `render.yaml`, which deploys both the API and the
web app as a pair. Easiest path:

1. Push this folder to your GitHub repo (`Music-App`):

   ```powershell
   cd c:\Users\Abdullah\Desktop\SuperMediaApp
   git add -A
   git commit -m "PWA + Capacitor Android"
   git push origin main
   ```

2. On https://dashboard.render.com → **New → Blueprint** → pick the repo.
   Render creates `supermediaapp-api` (FastAPI) and `supermediaapp-web`
   (static site) for free.

3. After the API service gets its URL, set on **supermediaapp-web**:
   `EXPO_PUBLIC_API_BASE_URL = https://supermediaapp-api.onrender.com`
   and redeploy the web service.

4. On **supermediaapp-api**, set `SMA_YTDLP_COOKIES_TEXT` (see
   `backend/cookies/README.md`) so YouTube downloads work from Render's IPs.

Your public link is then: `https://supermediaapp-web.onrender.com`

> Why Render over Vercel/Netlify/GitHub Pages: the static frontend would run
> anywhere, but the FastAPI backend (downloads, recognition, streaming) needs
> a Python web service — Render hosts both from one `render.yaml`, free.
> Free-tier caveats: the API sleeps after idle (first request takes ~30 s to
> wake) and the free disk is not persistent (library files can vanish on
> redeploys — upgrade to a paid disk for keeps).

## 2. iPhone — Add to Home Screen

Send iPhone users this:

1. Open `https://supermediaapp-web.onrender.com` in **Safari**.
2. Tap the **Share** button (square with arrow).
3. Tap **Add to Home Screen** → **Add**.

They get the Wavecairn mark icon, a splash screen, full-screen standalone mode
(no Safari bars), and it behaves like an app. That is the closest thing to an
iOS install that exists without the App Store — Apple does not allow
sideloading apps any other way (in the EU, alternative marketplaces exist, but
they require Apple developer accounts and notarization; the PWA is the
practical route).

## 3. Android — installable APK (sideload)

Android users can also just use Chrome's **Install app** menu on the website
(same PWA, zero warnings). For a real APK file you can hand to people, the
Capacitor project is fully set up in `frontend/android/`:

- App name **Wavecairn**, package `com.wavecairn.app`
- Launcher icons + dark splash generated for all densities
- Mic permission wired for song scanning
- The current web build is synced into the project

### Build the APK

This machine has no Java/Android SDK, so the compile step needs Android
Studio (free, one-time setup):

1. **Important:** the APK bundles the web app, so build it against the public
   API first — in `frontend/.env` set
   `EXPO_PUBLIC_API_BASE_URL=https://supermediaapp-api.onrender.com`, then:

   ```powershell
   cd c:\Users\Abdullah\Desktop\SuperMediaApp\frontend
   npm run build:android-web
   ```

2. Install Android Studio → open the `frontend/android` folder → let Gradle
   finish → **Build → Generate App Bundles or APKs → Generate APKs**.
   The file lands at
   `frontend\android\app\build\outputs\apk\debug\app-debug.apk`.

3. For a shareable release build, use **Build → Generate Signed App Bundle /
   APK → APK**, create a keystore when prompted (keep it — you need the same
   one for updates), and pick the `release` variant.

   Command-line equivalent once Studio/SDK is installed:

   ```powershell
   cd frontend\android
   .\gradlew assembleRelease
   ```

4. Share the APK any way you like — easiest is attaching it to a **GitHub
   Release** on your repo, which gives you a stable public download link.

> No Android Studio? Alternative: `npx eas build -p android --profile preview`
> builds a *true native* APK of this Expo app in Expo's free cloud — needs a
> free expo.dev account, no local SDK. Either output sideloads the same way.

### What Android users do (and the warnings they'll see)

1. Download the APK from your link.
2. Tap it → Android says **"For your security, your phone is not allowed to
   install unknown apps from this source"** → tap **Settings** → enable
   **Allow from this source** → back → **Install**.
3. Google Play Protect may add **"App scanned. This app was not verified by
   Play Protect"** or ask to scan it — tap **Install anyway**.

Those warnings are normal for every sideloaded APK (it just means "didn't
come from Google Play") — tell your users to expect them. The app updates by
sharing a new APK built with the same signing keystore; the website/PWA
versions update instantly on every deploy with no user action.
