# LibraryReplica: Handoff

## Status

All 15 steps of the specification were delivered **in a single pass** (the build environment could create and run files, and the instructions asked for a complete working project, so the "one step then wait for `next`" cadence was not used; see Deviations).

The static site is in **`public/`** (= the spec's `LibraryReplica/` folder). Docs and rules are in the repository root.

## What was actually verified (and what was not)

Verified in this environment:
- Every JS file parses; every `import { name }` resolves to a real `export` in the target file; every `href/src` asset exists; every element id used by page scripts exists in the page HTML (`node` static checker).
- A Node test harness exercised the **data layer in demo mode** (48 assertions, all pass): empty/invalid login, wrong password, short password, empty registration, duplicate email, duplicate cart add, quantity above stock, out-of-stock add, totals, wishlist, checkout requires login, invalid phone, empty-cart checkout, order saved + stock reduced + cart cleared, invoice HTML, student blocked from admin APIs, other users blocked from someone else's order, admin stats (960 books / 16 categories / 12 departments), book add/delete, order status update, demo import/upload/password-change notices, search/filter/sort/pagination.
- `npx next typegen`, `tsc --noEmit`, `npm run build` and `build_and_start` (health check) pass for the Next.js wrapper.
- `data/generate-books.js` produces 960 books with 960 distinct titles and 960 distinct IDs.

**NOT verified (no browser or Firebase project was available):** real Firebase Auth/Firestore/Storage behaviour, the security rules in the Rules Playground/emulator, visual rendering, the 3D flip on real touch hardware, printing the invoice, and layout at 360/768/1280 px. They are implemented as specified but must be checked by you. See the manual checklist below.

## File map

See README.md → "Where is everything?".

## Exported functions (real names + signatures)

### js/config.js
- `CONFIG` (object: `APP_NAME, CURRENCY_SYMBOL, CURRENCY_CODE, TAX_RATE, DELIVERY_CHARGE, FREE_DELIVERY_ABOVE, PAGE_SIZE, DEMO_MODE_IF_NO_FIREBASE, ADMIN_DEMO_EMAIL`)

### js/firebase-config.js
- `app`, `auth`, `db`, `storage` (Firebase instances or `null`), `isFirebaseConfigured` (boolean)
- `fb` (extra: loaded SDK namespaces `{app, auth, fs, st}`, empty in demo mode)
- `friendlyError(err, fallback?) -> string` (extra)

### js/main.js
- `initLayout() -> Promise<void>`
- `showToast(message, type='info')` (`success|error|info|warning`)
- `formatPrice(n) -> string`
- `escapeHTML(str) -> string`
- `getQueryParam(name) -> string|null`
- `openModal(html, options?) -> HTMLElement` (`options: {title, size:'sm'|'md'|'lg'|'xl', onClose}`)
- `closeModal()`
- `confirmDialog(message) -> Promise<boolean>`
- `debounce(fn, ms=250) -> function`
- `toggleTheme()`
- extras: `formatDate(iso)`, `getInitials(name)`, `setFieldError(input, message='')`, `clearFieldErrors(form)`, `openPrintWindow(html)`, `initReveal()`, `renderPagination(container, page, totalPages, onChange)`, `statusBadge(status)`

### js/auth.js
- `onAuthChange(cb) -> unsubscribe` (`cb(UserProfile|null)`)
- `getCurrentUser() -> UserProfile|null` (sync, cached)
- `requireAuth(redirectTo='login.html') -> Promise<UserProfile>` (redirects to `login.html?redirect=<page>` otherwise)
- `requireAdmin() -> Promise<UserProfile>` (re-reads the role from the data store; redirects to `index.html?error=admin_only`)
- `login(email, password, remember=false) -> Promise<UserProfile>`
- `register({fullName, studentId, email, password, department, semester}) -> Promise<UserProfile>` (always role `student`)
- `logout() -> Promise<void>`
- `resetPassword(email) -> Promise<void>`
- `updateUserProfile(uid, partial) -> Promise<UserProfile>` (only `fullName, studentId, department, semester, photoURL`)
- `changePassword(current, next) -> Promise<void>` (re-authenticates first)
- `DEMO_HINT` (string)
- extras: `whenAuthReady() -> Promise<void>`, `listDemoUsers() -> Promise<UserProfile[]>`

### js/books.js
- `getAllBooks() -> Promise<Book[]>` (cached)
- `getBookById(id) -> Promise<Book|null>`
- `getBooksByDepartment(deptSlug, specSlug?) -> Promise<Book[]>`
- `getDepartments() -> Department[]` (static taxonomy)
- `getDepartmentCounts() -> Promise<{[slug]: number}>` (keys: department slug, and `"dept/spec"` for CSE specializations)
- `addToRecentlyViewed(id)`, `getRecentlyViewedIds() -> string[]`
- `getRecommendedBooks(user, limit=8) -> Promise<Book[]>`
- `saveBook(book) -> Promise<Book>` (admin), `deleteBook(id) -> Promise<void>` (admin)
- `importBooksFromJson(onProgress?) -> Promise<{done,total}>` (admin, Firebase only, batches of 500, `onProgress({done,total})`)
- extras: `getCategories() -> Category[]` (16 flat categories), `setDemoStock(bookId, stock)`, `clearBooksCache()`

### js/bookcard.js
- `createBookCardElement(book, options?) -> HTMLElement` (`options.wishlistIds?: string[]`)
- `openPdfPreview(book)`
- extras: `detailsUrl(book)`, `renderStars(rating)`, `bookCoverHTML(book)`, `availabilityHTML(book)`, `renderSkeletonCards(container, count=8)`, `addToCartWithToast(book, qty=1)`, `toggleWishlistWithToast(book)`

### js/search.js (pure logic, extra module responsibilities)
- `searchBooks(books, query)`, `getSuggestions(books, query, limit=6)`, `filterBooks(books, filters)`, `sortBooks(books, key)`, `SORT_KEYS`, `paginate(items, page, size)`, `getFacets(books)`

### js/cart.js
- `getCart() -> Promise<CartItem[]>`
- `getCartDetailed() -> Promise<{book, quantity, lineTotal}[]>`
- `addToCart(id, qty=1) -> Promise<{quantity, capped}>`
- `updateQuantity(id, qty) -> Promise<number>`
- `removeFromCart(id)`, `clearCart()`, `getCartCount() -> Promise<number>`
- `calculateTotals(detailedItems) -> {subtotal, tax, deliveryCharge, totalAmount}` (sync)

### js/wishlist.js
- `getWishlistIds() -> Promise<string[]>`, `toggleWishlist(id) -> Promise<boolean>`, `isInWishlist(id) -> Promise<boolean>`, `moveWishlistToCart(id) -> Promise<{quantity,capped}>`

### js/orders.js
- `createOrder({customer, paymentMethod}) -> Promise<Order>`
- `getMyOrders() -> Promise<Order[]>`, `getOrderById(id) -> Promise<Order>` (owner/admin), `getAllOrders() -> Promise<Order[]>` (admin), `updateOrderStatus(id, status) -> Promise<Order|{orderId,orderStatus}>` (admin)
- `generateInvoiceHTML(order) -> string` (sync)
- extras: `ORDER_STATUSES`, `PAYMENT_METHODS`, `paymentLabel(method)`

### js/storage.js
- `uploadBookCover(bookId, file) -> Promise<url>`, `uploadBookPdf(bookId, file) -> Promise<url>`, `uploadProfilePhoto(uid, file) -> Promise<url>`
- extras: `validateImageFile(file)`, `validatePdfFile(file)`

### js/admin-api.js
- `getAdminStats() -> Promise<{totalBooks, totalCategories:16, totalDepartments:12, totalStudents, totalOrders, totalSales}>`
- `listUsers() -> Promise<UserProfile[]>`

### Page scripts (no exports): `dashboard.js`, `checkout.js`, `profile.js`, `admin.js`, `pages/*.js`

## Deviations from the specification (and why)

1. **Location**: the site is in `public/` because the project is a Next.js scaffold (the platform requires `build_and_start` + `/api/health`). `next.config.ts` rewrites `/` to `index.html`. For plain Live Server open `public/` as the workspace folder.
2. **One reply instead of 15 steps**: delivered together, no "next" gating.
3. **Extra files**: `js/pages/*.js` (11 small page scripts), because the spec's data modules may not touch the DOM and the spec lists no scripts for index/login/signup/departments/books/book-details/cart/wishlist/order pages. Also `images/hero-library.svg` (generated hero illustration) and `src/app/*` for Next.js.
4. **Extra exports** (listed above as "extras") were added to existing modules: `fb` and `friendlyError` in `firebase-config.js`; helpers in `main.js`, `books.js`, `auth.js`, `bookcard.js`, `orders.js`, `storage.js`. No contract function was renamed.
5. **`search.js`** is logic-only; the navbar suggestion box lives in `main.js` and the filter UI in `pages/books-page.js`.
6. **Async API**: functions that touch Firestore (`getCart`, `getCartCount`, `getWishlistIds`, `isInWishlist`, ...) return Promises, so callers `await` them.
7. **`getDepartmentCounts()`** also returns `"cse/<spec>"` keys for the specializations.
8. **Login redirect**: `requireAuth` appends `?redirect=<page>`; after login the user returns to that page (only local `*.html` targets are accepted), otherwise `dashboard.html` as specified.
9. **Demo-mode passwords**: registered demo users store a SHA-256 digest (salted with the email) in localStorage so a "wrong password" can be detected. It is labelled demo-only and is not security. Seed accounts use the shared password `Demo@1234`.
10. **Inline `onerror`** was replaced by one delegated, capturing `error` listener in `main.js` (no inline JS). Cards without a cover show the placeholder SVG tinted per department with the title overlaid.
11. **Sample PDF**: a real, tiny, valid placeholder `sample.pdf` was generated and is wired to 32 books; replace it with your authorised file.
12. **Order cancellation does not restock** books (students cannot raise stock under the rules; an admin can edit stock manually).
13. **Landing styles** live in `style.css`; dashboard/profile/admin/auth/books/cart/checkout have their own files as specified. Order pages reuse `checkout.css`, the dashboard and admin pages also load `checkout.css`/`dashboard.css` for shared components.

## Firestore rules: trade-off to be aware of

Checkout runs in the **student's** browser, so students must be allowed to update `books/{id}.stock`. The rules allow a non-admin update **only** when the sole changed field is `stock`, the new value is an integer `>= 0` and **lower** than the old one. A malicious student could therefore still lower stock without buying (denial-of-stock) or place an order with tampered prices (`orders.create` does not recompute totals server-side).

The stricter production solution is a **Cloud Function** (callable or Firestore-triggered) that validates the cart, recomputes prices, writes the order and decrements stock with admin privileges, with client writes to `books` and `orders` denied entirely.

## Why the Departments tab is read-only

The taxonomy (12 departments, 16 catalogue categories, fixed slugs) is part of the data contract: URLs (`?dept=&spec=`), book IDs, the signup department list and the admin statistic "16 categories / 12 departments" all depend on it. Making it editable would require a `departments` collection, migration of existing books, and slug-change redirects, which is out of scope. It is therefore a static constant in `books.js` and shown read-only in the admin console.

## Known issues / limitations

- Not browser-tested (see above). Please run the manual checklist.
- Font Awesome and Google Fonts load from CDNs: icons/fonts need internet access.
- The dark theme is applied when `main.js` loads, so a very brief light flash is possible on first paint (no inline script is allowed).
- Demo mode is not secure: roles and data are in localStorage and can be edited in DevTools. Never describe it as real security.
- Firebase: a user whose account has no `users/{uid}` document gets a default `student` profile on first login.
- `orders.create` rules do not verify totals/prices (see trade-off).
- `getAllBooks()` loads the whole catalogue (960 docs) once per page load; fine at this size but would need server-side pagination for a much larger catalogue.
- Admin "Users" lists up to the whole `users` collection (no pagination).
- Orders are listed newest-first by sorting in the browser (avoids a composite index).

## Manual test checklist (to run in Chrome)

Mark each after testing. "Code" = behaviour is implemented; "Node" = also exercised by the Node harness; the rest need a browser.

| # | Test | Status |
|---|---|---|
| 1 | Empty registration form shows field errors | Code |
| 2 | Invalid email is rejected (login + signup) | Code, Node |
| 3 | Wrong password shows "Incorrect email or password." | Code, Node |
| 4 | Duplicate cart entries merge quantities | Code, Node |
| 5 | Quantity above stock is capped / refused | Code, Node |
| 6 | Out-of-stock book cannot be added (disabled button + error) | Code, Node |
| 7 | Empty-cart checkout redirects to cart with a toast | Code (redirect + toast via `?notice=`) |
| 8 | Invalid phone number is rejected (not 10 digits) | Code, Node |
| 9 | Missing cover image falls back to placeholder | Code |
| 10 | Missing PDF shows "Preview not available" | Code |
| 11 | Student opening `admin.html` is redirected to `index.html?error=admin_only` with a toast | Code (`requireAdmin`) |
| 12 | Network/database failure shows a friendly toast | Code (all pages catch + `showToast`) |
| 13 | Dark mode persists across pages and reloads (`lr_theme`) | Code |
| 14 | Flip cards: mouse hover/click, touch tap, keyboard (flip buttons) | Code |
| 15 | Filters + URL params stay in sync (`dept, spec, q, sort, page, min, max, author, pub, rating, avail`) | Code |
| 16 | Order saved, stock reduced, cart cleared | Code, Node |
| 17 | Invoice opens in a new window and the print dialog appears | Code (pop-ups must be allowed) |
| 18 | No horizontal scroll at 360 / 768 / 1280 px | Code (responsive.css); verify visually |
| 19 | Whole app works in demo mode with zero configuration | Code, Node (data layer) |
| 20 | Firebase mode: rules in the emulator/Playground (student cannot set `role`, cannot edit price/stock upward, cannot read others' orders) | Not tested |

## Next steps for you

1. Open `public/` with Live Server and click through the checklist above.
2. (Optional) Create the Firebase project, paste the config, publish both rules files, create the first admin, import the catalogue.
3. Replace `public/pdf-previews/sample.pdf` with an authorised sample.
4. Take real screenshots for `docs/PROJECT_REPORT.md` section 14.
