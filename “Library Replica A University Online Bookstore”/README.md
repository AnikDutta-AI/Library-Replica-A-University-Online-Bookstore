# LibraryReplica

> **Your Academic World, One Book Away.**

LibraryReplica is a premium-looking **university online bookstore** built as an academic mini-project.
Students browse books by department, preview sample PDFs, use a cart and wishlist and do a **simulated** checkout.
Admins manage the catalogue, users and orders.

> **Disclaimer:** LibraryReplica is an independent academic project. It is **not** affiliated with Jain University or any other institution. No official logos or branding are used. All books, authors, publishers and prices are **sample data**. Payments are **simulated**: no real money or card data is ever processed.

## Features

- Landing page with hero, popular books, departments, featured categories, benefits, scroll-reveal animations
- Email/password authentication (Firebase) with a complete **Demo Mode** that needs zero setup
- 12 departments, 16 catalogue categories (5 CSE specializations + 11 departments), 960 sample books
- Catalogue search (title / author / department / specialization / subject / ISBN) with live suggestions, filters (department, specialization, price, author, publisher, rating, availability), sorting, 24-per-page pagination and URL-synced state
- **3D flip book cards** that work with mouse, touch and keyboard, and respect `prefers-reduced-motion`
- Book details with related books and a **PDF preview modal**
- Cart (stock-aware) and wishlist with live navbar counters
- Student dashboard (recommended, recently viewed, bestselling, new arrivals, discounted, orders, wishlist)
- Simulated checkout (COD / UPI / Card), order confirmation, printable invoice, order history
- Profile (edit details, photo upload, change password)
- Admin console: stats, book CRUD, uploads, department view, users, orders with status updates, catalogue import with progress bar
- Dark mode, toasts, skeleton loaders, custom 404, back-to-top, breadcrumbs, responsive layouts (360 / 768 / 1280)

## Where is everything? (important)

This repository is a Next.js scaffold, so the **static LibraryReplica site lives in `public/`**.
`public/` **is** the `LibraryReplica/` folder from the specification:

```
public/                    <- the LibraryReplica site root (open THIS folder with Live Server)
  index.html login.html signup.html departments.html books.html book-details.html
  cart.html wishlist.html dashboard.html checkout.html order-confirmation.html
  order-history.html profile.html admin.html 404.html
  css/   style.css auth.css books.css cart.css dashboard.css checkout.css profile.css admin.css responsive.css
  js/    config.js firebase-config.js main.js auth.js books.js bookcard.js search.js cart.js wishlist.js
         orders.js storage.js admin-api.js dashboard.js checkout.js profile.js admin.js
         pages/  (small per-page scripts: index, login, signup, departments, books-page, book-details,
                  cart-page, wishlist-page, order-confirmation, order-history, not-found)
  data/  generate-books.js  books.json
  images/ logo.svg placeholder-cover.svg hero-library.svg
  pdf-previews/ sample.pdf
firestore.rules  storage.rules  README.md  HANDOFF.md
docs/PROJECT_REPORT.md
next.config.ts  src/app/...   <- only serves public/ and exposes /api/health
```

## Prerequisites

- Node.js 18+ (only for regenerating the catalogue or running the Next.js wrapper)
- VS Code with the **Live Server** extension, and Chrome
- (Optional) A Firebase account for real auth/database/storage

## Running the site

### Option A: VS Code Live Server (recommended for the project demo)

ES modules **do not work from `file://`**, so you must use a local web server.

1. Open the **`public/`** folder in VS Code (File → Open Folder).
2. Right-click `index.html` → **Open with Live Server**.
3. The app starts in **Demo Mode** (a gold "Demo Mode" badge is shown in the navbar).

### Option B: the bundled Next.js server

```bash
npm install
npm run build && npm start     # then open http://localhost:3000
```

## Demo Mode (zero configuration)

While `public/js/firebase-config.js` still contains the `YOUR_...` placeholders, the whole app runs on `localStorage`:

| Account | Email | Password |
|---|---|---|
| Student | `student@libraryreplica.demo` | `Demo@1234` |
| Admin | `admin@libraryreplica.demo` | `Demo@1234` |

- Catalogue, cart, wishlist, checkout, orders and the admin tables all work. Data stays in your browser.
- You can also register new demo students (only a salted digest is kept, **this is not real security**).
- File uploads, password change and password-reset emails show a friendly "needs Firebase" notice.
- Clear the site data in Chrome DevTools (Application → Clear storage) to reset the demo.

## Firebase setup (real mode)

1. Go to the [Firebase Console](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** (production mode, choose a region).
4. **Build → Storage → Get started** (needs the Blaze plan on newer projects; the free quota is sufficient).
5. **Project settings → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` object.
6. Paste the values into `public/js/firebase-config.js` (replace every `YOUR_...`). The Demo badge disappears.
7. **Deploy the rules**: Firestore → Rules → paste `firestore.rules` → Publish. Storage → Rules → paste `storage.rules` → Publish. (Or with the CLI: `firebase deploy --only firestore:rules,storage`.)
8. **Authentication → Settings → Authorized domains**: add `localhost` / `127.0.0.1` (usually present) and your deployed domain.

### Create the first admin

Roles live **only** in Firestore. Nobody can become admin from the website.

1. Register a normal account on `signup.html`.
2. Firebase Console → Firestore → `users` → open that user's document.
3. Edit the field **`role`** from `"student"` to **`"admin"`** and save.
4. Log out and in again. The **Admin** link appears in the account menu.

### Import the sample catalogue into Firestore

1. Log in as admin → `admin.html` → **Import** tab → **Import Sample Catalogue**.
2. A progress bar shows batches of 500 writes (960 books in total). Re-running is safe (same IDs are overwritten).

### Required Firestore indexes

None. All queries are single-field (`orders` filtered by `userId`, sorted in the browser), so `firestore.indexes.json` is not needed.

## Generating the catalogue

`public/data/books.json` is already generated. To regenerate (deterministic output):

```bash
cd public
node data/generate-books.js
```

It writes 16 categories × 60 distinct titles = **960 books**, all marked `isSample: true`, with `isbn: null`, placeholder author/publisher names, and no fake PDF URLs.

## PDF previews

A tiny placeholder `public/pdf-previews/sample.pdf` is included and wired to 32 books (the first and 31st of each category). **Replace it with your own authorised sample PDF** (keep the file name) to see a real preview. Books without a PDF show "Preview not available".

## Simulated payments

Checkout never collects card numbers, CVV or UPI PINs. UPI/Card options show **"SIMULATED PAYMENT: no real money is processed"** on checkout, the confirmation page and the invoice.

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank page / console says "Failed to load module script" | You opened the file with `file://`. Use Live Server (or `npm start`). |
| "Demo Mode" badge still shows | `firebase-config.js` still has a `YOUR_...` value, or the Firebase CDN was blocked. |
| "You do not have permission to do that" | Rules not published, or you are not an admin. Check `users/{uid}.role`. |
| Catalogue is empty in Firebase mode | Run the **Import** tab as admin. |
| Admin link missing after editing `role` | Log out and log in again. |
| Uploads fail | Storage not enabled, rules not deployed, or file too large (images 2 MB, PDF 10 MB). |
| Stock never reduces for students | Make sure `firestore.rules` from this repo is published (students may only lower `stock`). |
| Layout looks unstyled / no icons | Font Awesome/Google Fonts CDNs need internet access. |

## Credits

Built as an academic mini-project with HTML5, CSS3, vanilla JavaScript (ES modules) and Firebase v10 (CDN). Icons by Font Awesome, fonts by Google Fonts (Playfair Display, Inter). All catalogue content is generated sample data.
