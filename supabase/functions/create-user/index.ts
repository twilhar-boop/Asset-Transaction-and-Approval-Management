import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }});
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller) throw new Error("Unauthorized");

    const adminClient = createClient(url, service);
    const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", caller.id).single();
    if (callerProfile?.role !== "Administrator") throw new Error("Only Administrator can register users");

    const body = await req.json();
    const { email, password, full_name, role } = body;
    const allowed = ["Administrator","Laboratory Staff","Requester / Viewer"];
    if (!email || !password || !full_name || !allowed.includes(role)) throw new Error("Invalid user data");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (createError) throw createError;

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: created.user.id, email, full_name, role
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    await adminClient.from("audit_logs").insert({
      user_id: caller.id,
      action: "REGISTERED_USER",
      module: "User Management",
      record_id: created.user.id,
      description: `Registered ${role} account for ${full_name}`
    });

    return new Response(JSON.stringify({ success: true, user_id: created.user.id }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});