# Deploy SuperMediaApp on Render

Render is the best free fit for this project because the backend is FastAPI and
the frontend can export to static web files.

## 1. Push the repo

Create a GitHub repository that contains this whole folder:

```text
SuperMediaApp/
  render.yaml
  backend/
  frontend/
```

Do not commit local secrets, databases, media, or build output. The root
`.gitignore` is already set up for that.

## 2. Deploy with Render Blueprint

1. Open Render.
2. Choose **New > Blueprint**.
3. Connect the GitHub repo.
4. Pick the repo root containing `render.yaml`.
5. Deploy.

Render will create:

- `supermediaapp-api`
- `supermediaapp-web`

## 3. Set frontend API URL

After `supermediaapp-api` gets its URL, set this environment variable on
`supermediaapp-web`:

```text
EXPO_PUBLIC_API_BASE_URL=https://supermediaapp-api.onrender.com
```

Then redeploy the frontend.

## 4. Optional public registration gate

To avoid random people using your downloader and storage:

Backend env:

```text
SMA_REGISTRATION_INVITE_CODE=choose-a-private-code
```

Frontend env:

```text
EXPO_PUBLIC_REGISTRATION_INVITE_REQUIRED=true
```

Then redeploy both services.

## 5. YouTube bot-check cookies

Cloud IPs are often challenged by YouTube. If downloads fail with "Sign in to
confirm you're not a bot", export YouTube cookies from your own browser as a
Netscape `cookies.txt` file, base64 it, and set this Render environment
variable on the Docker web service:

```text
SMA_YTDLP_COOKIES_B64=paste-base64-cookies-here
```

On Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\cookies.txt")) | Set-Clipboard
```

After setting the variable, redeploy. Cookies are private account credentials:
do not commit them to GitHub and refresh them if YouTube starts challenging
downloads again.

## Free-tier warning

Render free web services do not keep local filesystem changes permanently.
SQLite data and downloaded media may disappear after restarts or redeploys.
For real long-term use, upgrade to a paid Render service with a disk, or move
the database/storage to managed services.
