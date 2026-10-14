# NestJS Backend Template

A production-ready NestJS starter with **MySQL**, **TypeORM**, **Swagger (OpenAPI)**, **JWT auth with 3 roles**, an **email + OTP password reset** and a **central Media table** for uploaded images.

## Stack

| Concern        | Choice                                                         |
| -------------- | -------------------------------------------------------------- |
| Framework      | NestJS 10 (Express)                                            |
| Database       | MySQL 8 via `mysql2`                                           |
| ORM            | TypeORM 0.3 (repositories, migrations, soft delete)            |
| API docs       | `@nestjs/swagger` with the CLI plugin                          |
| Validation     | `class-validator` / `class-transformer` + global pipe          |
| Config         | `@nestjs/config` with Joi validation of `.env` at startup      |
| Auth           | `@nestjs/jwt` + `passport-jwt`, global guard, role guard       |
| Cache          | `@nestjs/cache-manager` (in-memory) for OTPs and reset tokens  |
| Mail           | `nodemailer` (SMTP, or console output when SMTP isn't set)     |
| Uploads        | Multer → `public/uploads`, served at `/files`                  |
| Security       | `helmet`, CORS, bcrypt hashing, hidden fields, magic-byte checks |

## Quick start

```bash
cp .env.example .env          # then edit DB credentials and JWT_SECRET
docker compose up -d mysql    # or point .env at an existing MySQL
npm install
npm run start:dev             # creates/updates the tables automatically (DB_SYNCHRONIZE=true)
npm run seed:admin            # in a second terminal: first admin from ADMIN_EMAIL / ADMIN_PASSWORD
```

### Tables are created and updated automatically

With `DB_SYNCHRONIZE=true` (the default), TypeORM compares the entities with the database every time the app starts. It creates missing tables and adds, changes or drops columns to match. Add a property to an entity, restart, and the column exists. No migration is needed during development.

> ⚠️ **Sync can delete data.** If you rename or remove an entity property, sync drops that column and everything in it; a rename doesn't move the data across. Changing a column's type can also lose data. **In production, set `DB_SYNCHRONIZE=false`** and use migrations instead (`npm run migration:generate --name=X`, review the SQL, `npm run migration:run`). The migration scripts and `src/database/migrations/` are kept for that. `DB_RUN_MIGRATIONS` stays `false` so migrations and sync don't run on the same database.

`npm run seed:admin` follows the same setting. It syncs the tables itself before inserting, so it works whether or not the app has run yet. With sync off, run the migrations first.

- API: `http://localhost:3000/api/v1/...`
- Swagger UI: `http://localhost:3000/docs` (JSON at `/docs-json`). Click **Authorize** and paste a token from `/auth/login`.
- Health check: `http://localhost:3000/api/health`
- Uploaded files: `http://localhost:3000/files/<filename>`

## Environment variables

See [`.env.example`](.env.example). The app refuses to start if a required variable is missing or invalid (`src/config/env.validation.ts`).

| Variable                  | Default       | Notes                                                    |
| ------------------------- | ------------- | -------------------------------------------------------- |
| `NODE_ENV`                | `development` | `development` / `production` / `test`                    |
| `PORT`                    | `3000`        |                                                          |
| `API_PREFIX`              | `api`         | Global route prefix                                      |
| `CORS_ORIGIN`             | `*`           |                                                          |
| `APP_URL`                 | `http://localhost:3000` | Public web app URL; invite links are `<APP_URL>/invite/<code>` |
| `DB_HOST`                 | required      |                                                          |
| `DB_PORT`                 | `3306`        |                                                          |
| `DB_USERNAME`             | required      |                                                          |
| `DB_PASSWORD`             | required      | May be empty                                             |
| `DB_DATABASE`             | required      |                                                          |
| `DB_SYNCHRONIZE`          | `true`        | Auto create/update tables on startup. `false` in prod!   |
| `DB_LOGGING`              | `false`       | Log SQL queries                                          |
| `DB_RUN_MIGRATIONS`       | `false`       | Run pending migrations on boot                           |
| `JWT_SECRET`              | required      | At least 32 characters                                   |
| `JWT_EXPIRES_IN`          | `15m`         | Access token lifetime, e.g. `15m`, `1h`                  |
| `REFRESH_TOKEN_TTL_DAYS`  | `30`          | Refresh token lifetime (rotated on every refresh)        |
| `OTP_TTL_SECONDS`         | `600`         | How long an emailed reset code is valid                  |
| `OTP_MAX_ATTEMPTS`        | `5`           | Wrong guesses before the code is burned                  |
| `RESET_TOKEN_TTL_SECONDS` | `900`         | How long the reset token from step 2 is valid            |
| `SMTP_HOST`               | empty         | Empty = emails are printed to the console (dev)          |
| `SMTP_PORT`               | `587`         |                                                          |
| `SMTP_SECURE`             | `false`       | `true` for port 465                                      |
| `SMTP_USER` / `SMTP_PASS` | empty         |                                                          |
| `MAIL_FROM`               | `NestJS App <no-reply@example.com>` |                                    |
| `MAX_FILE_SIZE_MB`        | `5`           | Upload size limit                                        |
| `MAX_TRIP_IMAGES`         | `30`          | Images per trip gallery                                  |
| `GOOGLE_PLACES_API_KEY`   | empty         | Google Places API (New) key; empty = places endpoints off |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | empty  | Only used by `npm run seed:admin`                        |
| `SWAGGER_ENABLED`         | `true`        | Set `false` to hide docs in production                   |
| `SWAGGER_PATH`            | `docs`        |                                                          |

## Roles

| Role           | How it's created                                         | Can do                                   |
| -------------- | -------------------------------------------------------- | ---------------------------------------- |
| `user`         | `POST /auth/register` (default)                          | Own profile, own media                   |
| `organization` | `POST /auth/register` with `role: "organization"` + `organizationName` | Same as user, plus `organizationName` on the profile |
| `admin`        | `npm run seed:admin`, or another admin via `POST /users` | Everything, incl. `/users` CRUD and anyone's media |

Every route requires a Bearer token unless it's marked `@Public()`. Restrict a route with `@Roles(UserRole.ADMIN)`, and read the caller with `@CurrentUser()` / `@CurrentUser('id')` (`src/modules/auth/decorators`).

## Endpoints

All under `/api/v1` (health is `/api/health`).

| Method | Route                    | Access          | Description                                       |
| ------ | ------------------------ | --------------- | ------------------------------------------------- |
| POST   | `/auth/register`         | public          | Sign up as user or organization → token + user    |
| POST   | `/auth/login`            | public          | → Access + refresh token, see [tokens](#access-and-refresh-tokens)   |
| POST   | `/auth/refresh`          | public          | New token pair (rotates the refresh token)        |
| POST   | `/auth/logout`           | public          | Revoke a refresh token                            |
| POST   | `/auth/logout-all`       | logged in       | Revoke all my refresh tokens                      |
| GET    | `/auth/me`               | logged in       | Current user                                      |
| PATCH  | `/auth/change-password`  | logged in       | `{ currentPassword, newPassword }` → new token    |
| POST   | `/auth/forgot-password`  | public          | Reset step 1                                      |
| POST   | `/auth/verify-otp`       | public          | Reset step 2                                      |
| POST   | `/auth/reset-password`   | public          | Reset step 3                                      |
| GET    | `/users/me`              | logged in       | My profile                                        |
| PATCH  | `/users/me`              | logged in       | Update name, phone, organizationName; optional `avatar` file (multipart) |
| POST   | `/users`                 | admin           | Create a user of any role                         |
| GET    | `/users`                 | admin           | List with `page`, `limit`, `search`, `role`       |
| GET    | `/users/:id`             | logged in       | Public profile (see [Profiles](#profiles-and-people-search)) |
| PATCH  | `/users/:id`             | admin           | Update (incl. role, `isActive`); optional `avatar` file (multipart) |
| DELETE | `/users/:id`             | admin           | Soft delete (`response_body: null`)               |
| POST   | `/media/upload`          | logged in       | Multipart: `file`, `type`, `entityId?`            |
| GET    | `/media`                 | logged in       | My media; filter `type`, `entityId`; admins `ownerId` |
| GET    | `/media/:id`             | logged in       | One media record                                  |
| DELETE | `/media/:id`             | owner or admin  | Deletes the record and the file                   |
| GET    | `/users/search?q=`       | logged in       | Find people by part of a name or email (masked emails) |

Trip endpoints are listed in [Trips](#trips).

## Access and refresh tokens

Login, register and change-password return two tokens:

```json
{
  "accessToken": "eyJhbGciOi...",   // send as  Authorization: Bearer <accessToken>
  "tokenType": "Bearer",
  "expiresIn": "15m",               // JWT_EXPIRES_IN
  "refreshToken": "kq0W2m...",      // keep it safe; lasts REFRESH_TOKEN_TTL_DAYS (30)
  "refreshTokenExpiresAt": "2026-11-06T19:30:00.000Z",
  "user": { ... }
}
```

How a client uses them:

1. Send the access token with every request.
2. When a request returns `401`, call `POST /auth/refresh { "refreshToken": "..." }`. You get a **new access token and a new refresh token**. Save both, then retry the request.
3. If the refresh itself returns `401`, the session is over: send the user to the login screen.

| Method | Route               | Description                                                                |
| ------ | ------------------- | -------------------------------------------------------------------------- |
| POST   | `/auth/refresh`     | New token pair from a refresh token (public)                               |
| POST   | `/auth/logout`      | Revoke this device's refresh token (public, works with an expired access token) |
| POST   | `/auth/logout-all`  | Revoke all of my refresh tokens (logged in)                                |

How they're protected:

- **Refresh tokens are random strings, not JWTs.** The database stores only a SHA-256 hash of each one, along with the device's user agent and IP.
- **Rotation:** every refresh token works once. Each refresh revokes the old token and issues a new one in the same "family" (everything descending from one login).
- **Reuse detection:** presenting a refresh token that was already used means someone copied it. The whole family is revoked, so both the thief and the real user have to log in again on that device. Other devices aren't affected.
- **Changing or resetting the password, or an admin disabling or deleting the account,** revokes all of the user's refresh tokens. Access tokens issued before a password change are rejected too.
- **Cleanup:** expired refresh tokens of a user are deleted whenever a new one is issued for them.

## Password reset flow

```
1. POST /auth/forgot-password  { "email": "jane@example.com" }
   → 200 { message: "If an account exists for this email, a verification code has been sent." }
   A 6-digit code is emailed (or printed to the console when SMTP_HOST is empty).

2. POST /auth/verify-otp       { "email": "jane@example.com", "otp": "123456" }
   → 200 { resetToken: "<64 hex chars>", expiresIn: 900 }

3. POST /auth/reset-password   { "resetToken": "<from step 2>", "newPassword": "NewStr0ngPass" }
   → 200 { message: "Your password has been reset. You can now log in." }
```

How it's protected:

- Step 1 returns the same message whether or not the email exists, so accounts can't be discovered through it.
- The code comes from `crypto.randomInt` and only its bcrypt hash is kept in the cache, for `OTP_TTL_SECONDS`. After `OTP_MAX_ATTEMPTS` wrong guesses the code is deleted and the user has to request a new one.
- The code works once. Step 2 deletes it and creates a random 32-byte reset token, which is cached for `RESET_TOKEN_TTL_SECONDS` under a SHA-256 hash of the token. The token also works once.
- A successful reset or password change sets `users.password_changed_at`. Every JWT issued before that moment is rejected, so a stolen token stops working. `PATCH /auth/change-password` returns a fresh token so the current session keeps working.

> **The cache is in memory.** Pending codes and reset tokens are lost when the app restarts, and they aren't shared between instances. That's fine for a single instance. To run several instances behind a load balancer, switch `CacheModule.register()` in `src/modules/auth/auth.module.ts` to a Redis store. `AuthService` uses the standard `Cache` interface, so it doesn't change.

## Media

Every uploaded file is recorded in one `media` table:

| Column          | Notes                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| `filename`      | Generated name (`<uuid>.<ext>`) stored in the DB; the file is `public/uploads/<filename>` |
| `original_name` | The name the client sent                                               |
| `mime_type`     | Detected from the file contents, not trusted from the client           |
| `size`          | Bytes                                                                  |
| `type`          | `profile` · `trip` · `cover` · `document` · `other` (`MediaType` enum)  |
| `owner_id`      | The user who uploaded it (deleting the user deletes their media rows)  |
| `entity_id`     | Optional id of the record it belongs to, e.g. the trip id for `type=trip` |

Responses include a computed `url` (`/files/<filename>`).

- Only jpeg, png, webp and gif files are accepted. The file's first bytes are checked, so a renamed file is rejected with `415`. Files over `MAX_FILE_SIZE_MB` get `413`.
- The upload is held in memory and only written to disk after validation passes. If saving the DB row fails, the file is removed, so rejected uploads don't leave stray files.
- `type=profile` sets the uploader's `users.avatar_id` and deletes their previous avatar (row and file). The user's `avatar` is returned with them.
- To add a new kind of image, add a value to `MediaType`, then write a migration that alters the enum column.

You can also set the avatar while updating the profile. Send `PATCH /users/me` (or the admin `PATCH /users/:id`) as `multipart/form-data` with an `avatar` file next to the other fields. The image is checked first; if the request is rejected, nothing is changed or written. Plain JSON updates without a file still work.

```bash
curl -X PATCH http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -F "firstName=Jane" -F "avatar=@me.jpg"
```

Example:

```bash
curl -X POST http://localhost:3000/api/v1/media/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@beach.jpg" -F "type=trip" -F "entityId=42"
```

`public/uploads` is gitignored, apart from a `.gitkeep`. In Docker, mount it as a volume so uploads survive container restarts.

## Trips

A trip has a name, start and end dates, the number of travelers, an optional estimated budget per person, and an optional hotel (name, plus latitude/longitude if you have them). Responses also include computed fields:

| Field           | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| `durationDays`  | Inclusive day count: Nov 1 → Nov 3 is 3 days           |
| `totalBudget`   | `budgetPerPerson × travelersCount`                     |
| `totalExpenses` | Sum of all activity expenses                           |
| `memberCount`   | Number of members                                      |
| `myRole`        | Your role in this trip                                 |

### Roles inside a trip

| Role     | Can do                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| `viewer` | See the trip, members, activities and ideas; propose ideas and vote                      |
| `editor` | Everything a viewer can, plus edit trip details and add/edit/delete activities and plans |
| `owner`  | Everything, plus invitations, the invite link, member roles, removing members, deleting the trip |

The creator is the owner. Ownership can be handed to another member (`POST /trips/:tripId/transfer-ownership`); the old owner becomes an editor. The owner can't leave or be removed until they hand it over. If you aren't a member, a trip returns `404`, so trip ids can't be probed. Site admins are treated as owners of every trip.

To protect a new trip feature (for example the chat), put `@UseGuards(TripRoleGuard)` on the controller and `@TripRole(TripMemberRole.VIEWER)` (or `EDITOR` / `OWNER`) on each route that has a `:tripId` param. `@CurrentTripRole()` gives you the caller's role.

### Inviting people

| How          | Role you get                   | Flow |
| ------------ | ------------------------------ | ---- |
| **By user id** | `viewer` (default) or `editor` | `POST /trips/:tripId/invitations { "userId": 2, "role": "editor" }`. Find the id with `GET /users/search?q=jane`. |
| **By email**   | `viewer` (default) or `editor` | `POST /trips/:tripId/invitations { "email": "friend@example.com" }`. If there's no account yet, the invitation waits until someone signs up with that email. |
| **By link**    | always `editor`                | Owner gets it from `GET /trips/:tripId/invite-link`, which returns `<APP_URL>/invite/<code>`. The frontend shows `GET /trips/invite/:code` (a preview), then calls `POST /trips/invite/:code/join`. `POST /trips/:tripId/invite-link/regenerate` makes the old link stop working. |

Invitations by id or email send an email, and appear for the invitee at `GET /invitations` to accept or decline. Inviting someone who's already a member, or who already has a pending invitation, returns `409`. The owner can list invitations and revoke pending ones.

### Activities and plans

`/trips/:tripId/activities`: members can read them; editors and owners can add, edit and delete them. Each one has:

- `kind`: `activity` or `plan`
- `name`, optional `description`
- `dayNumber`: day of the trip, from 1 up to `durationDays`
- `startTime` and `endTime` (`HH:MM`); the end must be after the start
- optional place: `placeName`, `placeLatitude`/`placeLongitude`
- optional meeting point: `meetingPointText` and/or `meetingLatitude`/`meetingLongitude`
- optional `transportation`: `walk`, `public_transport` or `drive`
- `expense` (default 0), which is added to the trip's `totalExpenses`

The list is sorted by day, then start time, and `?day=2` filters it to one day. A trip's dates can't be changed so that an activity or an open idea would fall outside them.

### Ideas and voting

`/trips/:tripId/ideas`: any member, viewers included, can propose an idea with the same fields as an activity, and vote on it with `PUT /trips/:tripId/ideas/:ideaId/vote { "value": "yes" | "no" }`.

- Proposing an idea counts as a yes vote from you. You can change your vote while the idea is open.
- When **more than half of the current members** have voted yes, the idea is **accepted**: it is copied into the activities automatically, and `activityId` points to the new activity.
- When half or more have voted no, a yes majority is no longer possible, so the idea is **rejected**. A tie counts as rejected.
- Each idea is returned with `yesCount`, `noCount`, `memberCount` and `myVote`.
- When someone leaves or is removed, their votes on open ideas are dropped and the open ideas are counted again.
- The proposer or the owner can delete an idea while it's open.

### Publishing and sharing

The owner chooses who outside the trip can see it, with `PATCH /trips/:tripId/visibility { "visibility": "..." }`:

| Visibility          | Who can see it                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| `private` (default) | Members only                                                                      |
| `link`              | Also anyone logged in who has the share link `<APP_URL>/trips/shared/<code>`      |
| `public`            | Also everyone: listed in `GET /trips/public` and on the owner's profile           |

- The **share link is read-only** and separate from the invite link. Viewing a trip never makes you a member; only the invite link or an invitation does that.
- The owner gets the link from the visibility response or `GET /trips/:tripId/share-link`. `POST /trips/:tripId/share-link/regenerate` makes the old one stop working.
- Setting a trip back to `private` stops the share link and the public pages immediately.
- People outside the trip get a read-only view: trip details, computed totals, activities, member count and the owner's public card. They don't see members, emails, invite or share codes, invitations or ideas.

| Method | Route                          | Description                                                   |
| ------ | ------------------------------ | ------------------------------------------------------------- |
| GET    | `/trips/public`                | Browse public trips: `q` (name), `from`/`to` (dates), `sort=newest\|start_date` |
| GET    | `/trips/public/:tripId`        | View a public trip with its activities                        |
| GET    | `/trips/shared/:shareCode`     | View a trip through its share link                            |

### Story, real spend, tips and photos

What the owner shares with people viewing the trip:

| Field                      | Set with                                    | Notes                                                    |
| -------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `story`                    | `PATCH /trips/:tripId/share-details` (owner) | Up to 5000 characters                                    |
| `actualSpentPerPerson`     | same                                        | What each person really spent. `budgetPerPerson` stays the estimate, and `spendDifferencePerPerson` = actual − estimate. |
| `tips`                     | same                                        | Up to 20 tips of up to 500 characters each. Sending `tips` replaces the whole list, in that order. |
| images (gallery)           | `POST /trips/:tripId/gallery`, or `images` on share-details | Up to 10 per request and `MAX_TRIP_IMAGES` (30) per trip |

- **Share details:** only the fields you send change. `null` clears the story or the spend. The endpoint accepts JSON, or `multipart/form-data` with `images` so the text and the photos can be saved together. In a form, `tips` can be repeated fields or one JSON array string, and an empty `actualSpentPerPerson` clears it.
- **Checked before anything is saved:** every image and the gallery limit. One bad file means nothing is saved.
- **Gallery permissions:** editors and owners can add images. Editors can delete the images they uploaded; the owner can delete any. `PATCH /trips/:tripId/gallery/order { mediaIds }` reorders them, and `PATCH /trips/:tripId/cover { mediaId }` picks the cover. Without a chosen cover, or after the cover is deleted, the first image is the cover.
- **Trip images only go through the gallery,** which checks your role in the trip. `POST /media/upload` refuses `type=trip`.
- **What people see:**
  - Viewing one trip (members, the public view or the share link): `story`, `tips`, `gallery`, `coverUrl`, `actualSpentPerPerson` and `spendDifferencePerPerson`.
  - Lists (`GET /trips/public`, profiles): `coverUrl`, a `storyExcerpt` (about 200 characters) and the spend.
- **Copying a trip** doesn't take the story, spend, tips or images. **Deleting a trip** deletes its tips and image files.

| Method | Route                              | Who          | Description                              |
| ------ | ---------------------------------- | ------------ | ---------------------------------------- |
| PATCH  | `/trips/:tripId/share-details`     | owner        | Story, actual spend, tips (+ images)     |
| GET    | `/trips/:tripId/gallery`           | members      | Images in order                          |
| POST   | `/trips/:tripId/gallery`           | editor/owner | Add images (multipart `images`)          |
| PATCH  | `/trips/:tripId/gallery/order`     | editor/owner | Reorder                                  |
| PATCH  | `/trips/:tripId/cover`             | editor/owner | Choose the cover (`null` = first image)  |
| DELETE | `/trips/:tripId/gallery/:mediaId`  | owner, or the editor who uploaded it | Delete an image and its file |

### Copying

Anyone who can see a trip (a member, a public trip, or a link-shared trip with its `shareCode`) can copy from it:

- `POST /trips/:tripId/copy { name?, startDate?, shareCode? }` makes a new **private** trip that you own. It copies the details, the hotel and every activity and plan, with the same days, times and expenses. Members, invitations, ideas and images are not copied. With a new `startDate` the trip keeps its length. The default name is "<original> (copy)", and `copiedFromTripId` points back to the original.
- `POST /trips/:tripId/activities/:activityId/copy { targetTripId, dayNumber?, shareCode? }` copies one activity into a trip where you're an editor or owner. It goes on the same day unless you pick another, and the day must exist in your trip.

### Profiles and people search

| Method | Route                     | Description                                                                      |
| ------ | ------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/users/:id`              | Profile: name, avatar, role, organization, public trip count. Email, phone and all-trip count only for yourself and admins. |
| GET    | `/users/:id/trips`        | That user's trips: public ones for everyone else; all of them for yourself and admins. Each has the user's `role`. |
| GET    | `/users/me/trips`         | All my trips with my role; filter `role` and `when=upcoming\|past` (same as `GET /trips`) |
| GET    | `/users/search?q=`        | Find people by part of a name, organization or email; every word must match (`jo sm` → John Smith) |

Search results show a masked email (`ja***@gmail.com`), unless your query was that exact address. That's enough to tell people apart when inviting, without letting anyone collect every user's email. Add `excludeTripId=<id>` to hide people who are already in one of your trips. Results are paginated, with at most 20 per page.

The group chat is planned for later.

## Places and hotels (Google Places)

City search and hotel suggestions use **Google Places API (New)** through the server, so the API key never reaches the browser or app.

**Setup:** in Google Cloud, enable **"Places API (New)"**, create an API key (ideally restricted to that API), and set `GOOGLE_PLACES_API_KEY` in `.env`. Without a key, these endpoints answer `503`.

| Method | Route                         | Description                                                                 |
| ------ | ----------------------------- | --------------------------------------------------------------------------- |
| GET    | `/places/cities/search?q=lis` | City autocomplete → `[{ placeId, name, description, fullText }]`. Optional `lang`, `sessionToken`. |
| GET    | `/places/cities/:placeId`     | City details: name, country, country code, coordinates                     |
| GET    | `/places/hotels`              | Hotels by `placeId` (city, best), `city` name, `lat`+`lng`, or free text `q`. Filters: `minRating` (1–5), `maxPriceLevel` (1 cheap … 4 luxury), `limit` (≤ 20), `pageToken`. Returns `{ hotels, nextPageToken }`. |
| GET    | `/places/photo?name=…`        | Hotel photo (image bytes). Use the `photoUrl` from results. Needs no login, but only serves photos that came back in our own results. |

Each hotel has `placeId, name, address, latitude, longitude, rating, userRatingCount, priceLevel (0–4), photoUrl, websiteUri, googleMapsUri, phone`.

- **Cache:** Google answers are cached in memory (10 min for searches, 1 day for details and photos) to save quota.
- **Errors:** if Google is slow (more than 8 s) or returns an error, the API answers `502` without passing on Google's message.

### Trip city and hotel

- **City:** give a trip a city with `cityPlaceId` (from the city search) on create or update. `city`, `country`, `cityLatitude` and `cityLongitude` are filled in from Google. A plain `city` name also works, without coordinates. Send `cityPlaceId: null` to clear it.
- **`GET /trips/:tripId/hotel-suggestions`** (members): hotels around the trip's city, with the same filters as `/places/hotels`.
- **`PUT /trips/:tripId/hotel { placeId, pricePerNight?, nights?, totalPrice?, currency?, paidById? }`** (editor or owner): sets `hotelName`, `hotelAddress`, `hotelPlaceId` and the position from Google. With a price, the trip gets **one hotel expense**: `totalPrice`, or `pricePerNight × nights`, where nights default to the trip length. Calling it again updates that same expense.
- **`DELETE /trips/:tripId/hotel`** removes the hotel and its expense.

## Expenses

A trip's total spending = **activity costs** (each activity's `expense`) + **the expenses list** (hotel, transport, food, shopping, other). Each item is counted once. Trips show `totalExpenses` and `totalExpensesPerPerson` (total ÷ travelers).

| Method | Route                                  | Who          | Description                                     |
| ------ | -------------------------------------- | ------------ | ----------------------------------------------- |
| GET    | `/trips/:tripId/expenses?category=`    | members      | List                                            |
| POST   | `/trips/:tripId/expenses`              | editor/owner | `{ title, amount, category?, currency?, date?, notes?, paidById? }` |
| PATCH  | `/trips/:tripId/expenses/:expenseId`   | editor/owner | Update                                          |
| DELETE | `/trips/:tripId/expenses/:expenseId`   | editor/owner | Delete                                          |
| GET    | `/trips/:tripId/expenses/summary`      | members      | Total, per person, by category (activities count as `activity`), by who paid, and what's left of the budget |

`paidById` must be a member of the trip. Amounts aren't converted between currencies; `currencies` in the summary lists which ones were used.

## Project structure

```
src/
├── main.ts                     # bootstrap: helmet, CORS, prefix, versioning, static /files, ValidationPipe, Swagger
├── app.module.ts               # Config + TypeORM wiring, global guards/filter/interceptors
├── app.controller.ts           # GET /api/health (public)
├── config/                     # app, auth, database, mail, swagger, upload + Joi env schema
├── common/
│   ├── entities/base.entity.ts # id, createdAt, updatedAt, deletedAt
│   ├── response/               # ApiEnvelope, @ResponseTitle()
│   ├── dto/                    # PaginationQueryDto, Paginated<T>, MessageResponseDto
│   ├── validators/             # @IsStrongPassword(), @ToLowerTrim()
│   ├── filters/                # AllExceptionsFilter (uniform error JSON)
│   └── interceptors/           # TransformInterceptor (response envelope)
├── database/
│   ├── data-source.ts          # DataSource for the TypeORM CLI
│   ├── migrations/             # InitSchema (users + media)
│   └── seeds/seed-admin.ts     # npm run seed:admin
└── modules/
    ├── auth/                   # register/login/reset, JwtStrategy, guards, decorators
    ├── mail/                   # MailService (SMTP or console)
    ├── media/                  # Media entity, upload/list/delete, file storage
    ├── places/                 # Google Places proxy: city search, hotels, photos
    ├── trips/                  # trips, members, invitations, activities, ideas + votes
    └── users/                  # User entity (3 roles), admin CRUD, /users/me
```

## Response format

**Every** JSON response, success or error, has exactly this shape:

```ts
{
  status_code: number;          // same as the HTTP status
  response_title: string;       // short human title
  response_body: data | null;   // the result; null for errors and for actions with nothing to return
  response_error: string | null // the error message; null on success
}
```

Success (`GET /api/v1/trips/1`):

```json
{
  "status_code": 200,
  "response_title": "Trip fetched",
  "response_body": { "id": 1, "name": "Lisbon weekend", "durationDays": 3 },
  "response_error": null
}
```

Error (validation messages are joined with `; `):

```json
{
  "status_code": 400,
  "response_title": "Bad Request",
  "response_body": null,
  "response_error": "email must be an email; password must be longer than or equal to 8 characters"
}
```

- `TransformInterceptor` wraps successes. The title comes from `@ResponseTitle('...')` on the route; without one it's the status phrase (`OK`, `Created`). Every existing endpoint has a title.
- `AllExceptionsFilter` wraps every error, including validation, the login and role checks (`401`/`403`), invalid ids, upload limits (`413`/`415`), unknown routes (`404`), malformed JSON and database errors. MySQL duplicate-key errors become `409 Conflict`. Unexpected errors return `500` with the generic message `Internal server error`; the details go to the server log only.
- Deletes and other actions with nothing to return use `200` with `response_body: null` (never `204`), so the client always gets a body.
- Files under `/files/...` and the Swagger UI are not wrapped.
- Swagger (`/docs`) shows the envelope around each endpoint's data, plus a shared `ErrorResponse` schema.

`password`, `passwordChangedAt` and `deletedAt` are marked `@Exclude()` and never leave the API.

## Adding a new module

```bash
npx nest g resource modules/trips --no-spec
```

Then follow the Users pattern: extend `BaseEntity`, decorate DTOs with `class-validator` and `@ApiProperty`, inject the repository with `@InjectRepository`, add `@ApiBearerAuth()` and `@Roles(...)` where needed. Attach images by uploading with `type=trip&entityId=<trip id>` and listing them with `GET /media?type=trip&entityId=<id>`. Entities are picked up automatically (`autoLoadEntities`). Generate a migration with:

```bash
npm run migration:generate --name=AddTrips
npm run migration:run
```

## Scripts

| Script                                | What it does                         |
| ------------------------------------- | ------------------------------------ |
| `npm run start:dev`                   | Watch mode                           |
| `npm run build` / `npm run start:prod`| Compile to `dist/` and run           |
| `npm test` / `npm run test:cov`       | Jest unit tests                      |
| `npm run lint` / `npm run format`     | ESLint / Prettier                    |
| `npm run migration:generate --name=X` | Diff entities vs DB into a migration |
| `npm run migration:create --name=X`   | Empty migration                      |
| `npm run migration:run` / `:revert`   | Apply / roll back                    |
| `npm run seed:admin`                  | Create the first admin               |

> On this machine there's a stray `eslint.config.js` in the parent folder that ESLint 8 picks up first. Run lint as `$env:ESLINT_USE_FLAT_CONFIG='false'; npm run lint` in PowerShell, or remove that file.

## Docker

```bash
docker build -t nestjs-backend .
docker run --env-file .env -p 3000:3000 -v "$(pwd)/public/uploads:/app/public/uploads" nestjs-backend
```

`docker-compose.yml` ships a MySQL 8 service for local development.
