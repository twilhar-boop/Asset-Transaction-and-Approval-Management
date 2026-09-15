# Laboratory 4 - Asset Transaction and Approval Management

This project follows Laboratory 4 Section A: Role-Based Asset Transaction and Approval Management.

## Roles

- **Administrator** — manages users and equipment, approves/rejects requests, manages maintenance, and views audit logs.
- **Laboratory Staff** — views equipment, creates borrowing transactions, processes returns, and submits maintenance requests.
- **Requester / Viewer** — views available equipment, submits borrowing requests, and views own request status/history.

## Important registration rule

There is **no public Sign Up button**. Only an Administrator can register new users from **User Management**. The first Administrator must be created once through Supabase Authentication, after which that Administrator can create the other accounts.

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Create the first Administrator in Supabase Authentication > Users.
4. Add the first Administrator's UUID to `profiles` using the SQL comment in `schema.sql`.
5. Deploy `supabase/functions/create-user/index.ts` as a Supabase Edge Function.
6. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the required Supabase Edge Function secrets.
7. Put the project files in a GitHub repository.
8. Replace the values in `js/config.js` with the Supabase project URL and anon/publishable key.
9. Enable GitHub Pages from the repository settings.

Never place the Supabase `service_role` key in `config.js`, GitHub, or the browser.
