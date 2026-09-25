# Annbell Fashions and Design

A point-of-sale and shop management app for a tailoring business, built with React/Vite + Supabase. This is adapted from a pharmacy POS build, so under the hood it uses the same solid feature set — just without expiry dates, since fabric and garments don't expire.

## What's included
- Staff sign-in (Supabase Auth). **No self-signup** — an Admin creates every login (cashier or admin) from Settings → Staff & roles, via a secure Supabase Edge Function.
- **Roles**: Admin sees everything (Dashboard, Sales, Products, Orders, Expenses, Customers, Services, Vendors, Settings). Cashier sees Sales, their own "My Sales" dashboard, and can add Products.
- Bottom navigation bar, responsive layout (works well on both phone and desktop browsers).
- **Logo**: upload anytime from Settings — shown on login, top bar, and receipts.
- **Dashboard** (Admin): total sales, gross/net profit (after expenses), cost of goods, stock value (cost & retail), services sold, a daily sales chart, and a low-stock notice, for Today / Week / Month / a custom range. Tap any sale to see its itemized contents.
- **"My Sales"** (Cashier): same date-range view, just their own totals, no financial figures.
- **Products**: photo, buying price, selling price, barcode (type or scan), and a low-stock alert level (no expiry date). Anyone can add or restock (📦); only Admin can edit or delete. Out-of-stock items can't be sold.
- **Barcode scanning**: camera-based, with a success/error beep.
- **Sales**: sells both Products and Services from one cart. Customer field autocompletes from saved customers or creates a new one. Records Amount Paid and shows Change/Balance Due. Ends in a printable receipt with a logo watermark, "served by" staff name, and a scannable QR code.
- **Orders** (Admin): raise a purchase order to a vendor, then Print / Save as PDF / Send via WhatsApp. Past orders are editable and deletable.
- **Expenses** (Admin): log spend by category and date, feeding into the Dashboard's profit figures.
- **Customers, Services, Vendors** (Admin): full add/edit/delete, with an optional photo on services.
- **Settings** (Admin): shop name, address, logo, receipt footer, and staff accounts/roles. An admin can't change their own role (prevents accidental lockouts).

## Setting this up on a new Supabase account

This app needs its own fresh Supabase project — it does **not** reuse the pharmacy's project or data.

1. **Create a Supabase project**: go to supabase.com → New Project. Any name/region/free tier is fine.
2. **Run the schema**: open `supabase/schema.sql` from this package, copy all of it, paste into your new project's Supabase Dashboard → SQL Editor → New query → Run. This creates every table, security rule, and the storage bucket for photos in one go.
3. **Deploy the edge function**: the file at `supabase/functions/create-staff/index.ts` is required for Settings → "Create staff account" to work. Deploying it needs the Supabase CLI (`supabase functions deploy create-staff`) or Claude with this new Supabase project connected — come back and ask if you'd like help with this step once the project exists.
4. **Create your first admin** (chicken-and-egg step, since Settings needs an admin to already exist):
   - Supabase Dashboard → Authentication → Users → Add user. Set an email and password, and toggle "Auto Confirm User".
   - Copy the new user's ID from that screen, then run in SQL Editor:
     ```sql
     insert into public.profiles (id, name, role) values ('paste-the-user-id-here', 'Your Name', 'admin');
     ```
5. **Get your API keys**: Supabase Dashboard → Settings → API. Copy the Project URL and the `anon` public key.
6. **Set environment variables**: in Vercel (or wherever you deploy), set:
   - `VITE_SUPABASE_URL` — the Project URL from step 5
   - `VITE_SUPABASE_ANON_KEY` — the anon key from step 5
   (`.env.example` in this package shows the format — don't commit real keys to a public repo.)
7. **Upload a logo**: there's no logo bundled with this package. Sign in as admin and upload one from Settings, or drop a `logo.jpg` into the `public/` folder before deploying.
8. **Deploy**: push this folder to a GitHub repo, then import it into Vercel as a new project (Framework preset: Vite), with the two environment variables from step 6 set.

Once deployed, sign in with the admin account you created in step 4, and use Settings to create logins for the rest of the staff.


## Step 1B — Offline sales foundation

This version keeps the existing Supabase backend and adds a phone-local IndexedDB cache and synchronization queue. Products, services and customers used by the Sales screen are cached locally after a successful online load. Sales and sale items can be recorded while offline and are queued for upload when the phone reconnects. Product stock and customer totals are updated locally and queued for synchronization.

This is an incremental offline implementation. The remaining admin modules (Products, Customers, Services, Vendors, Orders and Expenses) can be migrated to the same queue in the next step after this version is tested.
