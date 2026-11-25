-- The hangout tables were created after the March RLS migration and never had row level security turned on,
-- so the public anon key could read, edit and delete them through the Supabase API (advisor: rls_disabled_in_public).
-- With RLS on and no policy only the app's own database role (Prisma, the table owner) can reach them. The app reads
-- them only through Prisma; the live refresh uses a broadcast channel, not table changes.
ALTER TABLE public."hangout_attendees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_cars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_cost_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_cost_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_passengers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_pending_updates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_riders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hangout_transit" ENABLE ROW LEVEL SECURITY;
