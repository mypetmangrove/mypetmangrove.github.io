# My Pet Mangrove website

The website, lesson library, and teacher portal for mypetmangrove.org.

What runs where, and what it costs:

| Piece | Service | Cost |
| --- | --- | --- |
| Website hosting | GitHub Pages | Free |
| Editing dashboard | Pages CMS (app.pagescms.org) | Free |
| Teacher accounts, forms, photos | Supabase, free plan | Free |
| Teacher emails (sign-up, password reset) | Your Gmail | Free |
| mypetmangrove.org | Squarespace Domains (for now) | Yearly renewal |

Your Squarespace site stays live the whole time. Nothing changes for visitors until step 6.

---

## Step 1. Back up Squarespace (15 minutes)

1. In Squarespace, open every page and save every photo you want to keep. Squarespace's export doesn't include the image files themselves.
2. Settings → Advanced → Import / Export → Export. Download the file.
3. If your Squarespace site has form submissions or a mailing list, export those too.

## Step 2. Put the website on GitHub (20 minutes)

1. Create a free account at github.com. Pick a username you're happy to see in a web address, like `mypetmangrove`.
2. Install **GitHub Desktop** (desktop.github.com) and sign in.
3. Unzip this folder somewhere you'll keep it, like Documents.
4. In GitHub Desktop: File → Add local repository → choose the folder → "create a repository" → Create.
5. Click **Publish repository**. Name it exactly `YOURUSERNAME.github.io` (for example `mypetmangrove.github.io`) and **uncheck** "Keep this code private". Free GitHub Pages needs a public repository. That's fine: nothing secret is in these files.
6. On github.com, open the repository → Settings → Pages → under "Build and deployment", set Source to **GitHub Actions**.
7. Open the Actions tab and wait for "Publish website" to turn green (about 2 minutes). If it didn't start on its own, click it, then **Run workflow**.
8. Visit `https://YOURUSERNAME.github.io`. That's your new site's preview address.

## Step 3. Turn on the editing dashboard (5 minutes)

1. Go to app.pagescms.org and sign in with GitHub.
2. When asked, install the Pages CMS app on your repository.
3. Open the repository. You'll see Pages, Lesson library, Planting days, News, Press and recognition, and Site settings.

Every time you save, the site republishes on its own in about a minute.

- **Pages** are built from sections you can reorder, add, or delete: text and photo, cards, numbered steps, quotes, numbers, videos, questions and answers, forms, galleries. To make a new page, create a new entry. Its address will be `/its-title/`.
- **Lesson library**: add a lesson, choose its grade levels (leave empty for all grades), attach PDFs or a Google Drive link, and switch on Published.
- **Planting days**: add one per date. Past dates move to "Past planting days" automatically.
- **Site settings**: email, social links, the Donate button link, and the main menu.

`mypetmangrove.org/admin` will also take you to the dashboard once the domain is moved.

## Step 4. Turn on teacher accounts (15 minutes)

Until this step, the Teacher login page runs a preview with sample data, and website forms open the visitor's email app instead of saving.

1. Create a free account at supabase.com and a new project named `mypetmangrove`. Save the database password somewhere safe.
2. In the project, open **SQL Editor** → New query. Paste the entire contents of `supabase/schema.sql` from this folder and click **Run**. It should say "Success".
3. Find your **Project URL** and your **publishable key**. Both are under the project's Connect button or Project Settings → API Keys. The publishable key is designed to be public; never paste the secret key anywhere.
4. In the Pages CMS dashboard → Site settings → Teacher portal connection, paste both and save.
5. In Supabase → Authentication → URL Configuration:
   - Site URL: `https://www.mypetmangrove.org`
   - Redirect URLs: add `https://www.mypetmangrove.org/teacher-portal/` and `https://YOURUSERNAME.github.io/teacher-portal/`

## Step 5. Let the portal send emails (10 minutes)

Supabase's built-in email only sends to you, so teachers wouldn't get confirmation or password-reset emails. Use your Gmail:

1. Turn on 2-Step Verification on mypetmangrove@gmail.com (Google Account → Security).
2. Google Account → Security → App passwords → create one named "Supabase". Copy the 16-character password.
3. Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP:
   - Sender email: `mypetmangrove@gmail.com`, sender name: `My Pet Mangrove`
   - Host: `smtp.gmail.com`, Port: `587`
   - Username: `mypetmangrove@gmail.com`, Password: the app password
4. Save.

Then make yourself the admin:

1. Go to `/teacher-portal/` on your site, create an account with your email, and confirm it from your inbox.
2. In Supabase → SQL Editor, run (with your email):

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'mypetmangrove@gmail.com');
   ```

3. Refresh the portal. An **Admin** tab appears with every teacher, website messages, the photo review queue, and your email list.

## Step 6. Move mypetmangrove.org (10 minutes, then up to 24 hours to take effect)

Do this once you're happy with the preview.

1. On GitHub: repository → Settings → Pages → Custom domain → enter `www.mypetmangrove.org` → Save.
2. In Squarespace → Domains → mypetmangrove.org → DNS settings:
   - Delete the **Squarespace Defaults** records (the ones pointing at Squarespace).
   - Keep any records you've added for Google or email verification.
   - Add four **A** records, host `@`, values `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Add a **CNAME** record, host `www`, value `YOURUSERNAME.github.io`
3. Back on GitHub Pages settings, wait for the DNS check to pass, then tick **Enforce HTTPS**. The certificate can take up to an hour.
4. Recommended: GitHub → your profile Settings → Pages → Add a verified domain. Follow its instructions to add one TXT record in Squarespace. This stops anyone else from using your domain on GitHub.

## Step 7. Cancel the Squarespace website plan

Once `https://www.mypetmangrove.org` shows the new site, cancel the Squarespace **website** subscription. Keep the **domain** renewing.

Later, you can transfer the domain to a cheaper registrar. In Squarespace Domains, unlock it and request the authorization (EPP) code, then start the transfer at the new registrar. Afterward, re-add the DNS records from step 6 there.

---

## Good to know

- **Student privacy.** The portal asks for first names and last initials only. Each teacher sees only their own classes; you see everything as admin. Photos stay private unless a teacher ticks "OK to feature" and you approve them.
- **Keeping the database awake.** Free Supabase projects pause after 7 days without activity. The "Keep teacher portal awake" job in the Actions tab checks in every 3 days to prevent that. If the project ever pauses anyway, open Supabase and click Restore.
- **Storage.** The free plan holds 1 GB of photos. The portal shrinks each photo to about 300 KB before uploading, so that's room for a few thousand.
- **Photos from the agency preview.** Several images in `src/images/site` came from the USA Web Experts preview and may be stock photos they licensed. Replace any you don't have rights to: Pages CMS → the page → the section → image.
- **Your phone number** isn't shown anywhere on the public site.
- **Working on the code with Claude.** Open the folder in Claude Code, or paste a file into a chat. To preview on your own computer: install Node.js, run `npm install`, then `npm start`, and open http://localhost:8080.
