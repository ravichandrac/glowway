# Glowway

Glowway is your personal, installable live traffic app. It uses your current iPhone location to identify the nearest of your three fixed places, then lets you choose one of the other two destinations. The fixed places are Droitwich (`WR9 7DH`), Brandwood Road (`B14 6BH`), and Kenyon Street (`B18 6AR`). It then gets a live, traffic-aware route from TomTom and colours each affected road section:

- Green moves quickly: traffic is flowing.
- Amber moves more slowly: traffic is building.
- Red crawls only along the heavy-traffic sections.

## What you need

1. An iPhone with Safari.
2. A free TomTom developer account and API key.
3. A free GitHub account to host the app securely (HTTPS is required for iPhone location access).

## Create your free TomTom key

1. Visit <https://developer.tomtom.com/> and choose **Sign up**.
2. Verify your email, then open the TomTom dashboard.
3. Create an API key with access to **Search API** and **Routing API**.
4. Copy the key somewhere safe. You will paste it into Glowway on the phone; it is saved only in Safari on that phone.

TomTom's free allocation is ample for personal use. Their current pricing page lists free traffic/routing usage; check it before changing providers: <https://docs.tomtom.com/pricing>.

## Put Glowway online for free with GitHub Pages

1. Go to <https://github.com/> and create a free account if you do not already have one.
2. Click the **+** in the top-right corner, then **New repository**.
3. Name it `glowway`, choose **Public**, and click **Create repository**.
4. On the new repository page, click **uploading an existing file**.
5. Drag in every file and folder from this Glowway project, including the `icons` folder. Do not upload the `.git` folder.
6. Click **Commit changes**.
7. Open **Settings** in the repository, then **Pages** in the left-hand menu.
8. Under **Build and deployment**, choose **Deploy from a branch**. Select the `main` branch and the `/ (root)` folder, then click **Save**.
9. Wait about one minute. Refresh that page until GitHub shows a link similar to `https://YOUR-USERNAME.github.io/glowway/`.

## Install it on your iPhone

1. Send the GitHub Pages link to yourself, then open it in **Safari** on your iPhone.
2. Tap the **Share** button (the square with the upward arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. You now have a Glowway icon on your Home Screen.
5. Open Glowway, paste your TomTom key once, then press **Save key**.
6. When Safari asks for location permission, choose **Allow While Using App**.

## Everyday use

Open Glowway whenever you want a live check. It immediately displays the two places other than the one you are nearest, so you can select your destination with one tap. Tap **Refresh live traffic** whenever you want the latest route calculation.

## Important privacy note

This app does not have a server or database. Your API key is kept in the browser storage of the phone where you configure it. GitHub Pages hosts only the app files. Avoid sharing the GitHub Pages link, because anyone who has it can load the app (but they cannot see the key stored in your phone).
