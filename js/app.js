const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null, profile = null, currentView = "dashboard";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const toast = msg => { const t=$("toast"); t.textContent=msg; t.style.display="block"; setTimeout(()=>t.style.display="none",2500); };
const isAdmin = () => profile?.role === "Administrator";
const isStaff = () => profile?.role === "Laboratory Staff";
const canRequest = () => isStaff() || profile?.role === "Requester / Viewer";

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginMsg").textContent = "Signing in...";
  const {error} = await sb.auth.signInWithPassword({email:$("email").value.trim(), password:$("password").value});
  $("loginMsg").textContent = error ? error.message : "";
});

$("logoutBtn").onclick = async () => { await sb.auth.signOut(); };

async function loadSession(){
  const {data:{session}} = await sb.auth.getSession();
  if(session) await startApp(session.user);
  else showLogin();
}
sb.auth.onAuthStateChange(async (_event, session) => {
  if(session) await startApp(session.user); else showLogin();
});

function showLogin(){
  currentUser=null; profile=null;
  $("loginView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("logoutBtn").classList.add("hidden");
}

async function startApp(user){
  currentUser=user;
  const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).single();
  if(error || !data){ await sb.auth.signOut(); $("loginMsg").textContent="Your account has no authorized profile."; return; }
  profile=data;
  $("loginView").classList.add("hidden"); $("appView").classList.remove("hidden"); $("logoutBtn").classList.remove("hidden");
  $("userInfo").textContent=`${profile.full_name} • ${profile.role}`;
  buildNav(); showView("dashboard");
}

function buildNav(){
  const items=[["dashboard","Dashboard"],["equipment","Equipment"],["borrowing","Borrowing"],["maintenance","Maintenance"]];
  if(isAdmin()) items.push(["users","User Management"],["audit","Audit Logs"]);
  $("nav").innerHTML=items.map(([id,label])=>`<button data-view="${id}">${label}</button>`).join("");
  $("nav").querySelectorAll("button").forEach(b=>b.onclick=()=>showView(b.dataset.view));
}
function showView(id){
  currentView=id;
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  $(id).classList.remove("hidden");
  document.querySelectorAll("#nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  $("pageTitle").textContent = id==="users"?"User Management":id==="audit"?"Audit Logs":id[0].toUpperCase()+id.slice(1);
  ({dashboard:renderDashboard,equipment:renderEquipment,borrowing:renderBorrowing,maintenance:renderMaintenance,users:renderUsers,audit:renderAudit})[id]();
}

async function renderDashboard(){
  const [{count:ec},{count:bc},{count:mc}]=await Promise.all([
    sb.from("equipment").select("*",{count:"exact",head:true}),
    sb.from("borrowing_requests").select("*",{count:"exact",head:true}).eq("status","Pending"),
    sb.from("maintenance_requests").select("*",{count:"exact",head:true}).eq("status","Pending")
  ]);
  $("dashboard").innerHTML=`<div class="grid">
    <div class="stat">Equipment<b>${ec??0}</b></div>
    <div class="stat">Pending Borrowing<b>${bc??0}</b></div>
    <div class="stat">Pending Maintenance<b>${mc??0}</b></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Role Access</h2><p class="muted">You are signed in as <b>${esc(profile.role)}</b>. ${isAdmin()?"Only Administrators can create user accounts, approve/reject borrowing requests, manage users, and view audit logs.":"Your available functions are limited to your assigned role."}</p></div>`;
}

async function renderEquipment(){
  let q=sb.from("equipment").select("*").order("created_at",{ascending:false});
  const {data,error}=await q;
  if(error){$("equipment").innerHTML=`<p>${esc(error.message)}</p>`;return;}
  $("equipment").innerHTML=`<div class="section-head"><h2>Equipment</h2>${isAdmin()?'<button class="btn primary" onclick="openEquipmentForm()">Add Equipment</button>':""}</div>
  <div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Status</th><th>Location</th>${isAdmin()?"<th>Action</th>":""}</tr></thead><tbody>
  ${data.map(x=>`<tr><td>${esc(x.asset_code)}</td><td>${esc(x.name)}</td><td>${esc(x.category)}</td><td><span class="badge ${esc(x.status)}">${esc(x.status)}</span></td><td>${esc(x.location)}</td>${isAdmin()?`<td><button class="btn danger" onclick="deleteEquipment('${x.id}')">Delete</button></td>`:""}</tr>`).join("")}</tbody></table></div>`;
}

async function renderBorrowing(){
  let query=sb.from("borrowing_requests").select("*,equipment(asset_code,name),profiles!requester_id(full_name)").order("created_at",{ascending:false});
  if(!isAdmin()) query=query.eq("requester_id",currentUser.id);
  const {data,error}=await query;
  if(error){$("borrowing").innerHTML=`<p>${esc(error.message)}</p>`;return;}
  $("borrowing").innerHTML=`<div class="section-head"><h2>Borrowing Requests</h2>${canRequest()?'<button class="btn primary" onclick="openBorrowForm()">New Request</button>':""}</div>
  <div class="table-wrap"><table><thead><tr><th>Requester</th><th>Equipment</th><th>Purpose</th><th>Status</th><th>Dates</th><th>Action</th></tr></thead><tbody>
  ${data.map(x=>`<tr><td>${esc(x.profiles?.full_name)}</td><td>${esc(x.equipment?.asset_code)} - ${esc(x.equipment?.name)}</td><td>${esc(x.purpose)}</td><td><span class="badge ${esc(x.status)}">${esc(x.status)}</span></td><td>${esc(x.start_date)} → ${esc(x.end_date)}</td><td class="actions">${isAdmin()&&x.status==="Pending"?`<button class="btn success" onclick="decideRequest('${x.id}','Approved')">Approve</button><button class="btn danger" onclick="decideRequest('${x.id}','Rejected')">Reject</button>`:""}${isAdmin()&&x.status==="Approved"?`<button class="btn primary" onclick="releaseRequest('${x.id}')">Release</button>`:""}${isStaff()&&x.status==="Released"?`<button class="btn secondary" onclick="returnRequest('${x.id}')">Return</button>`:""}</td></tr>`).join("")}</tbody></table></div>`;
}

async function renderMaintenance(){
  let q=sb.from("maintenance_requests").select("*,equipment(asset_code,name),profiles!requester_id(full_name)").order("created_at",{ascending:false});
  if(!isAdmin()) q=q.eq("requester_id",currentUser.id);
  const {data,error}=await q;
  if(error){$("maintenance").innerHTML=`<p>${esc(error.message)}</p>`;return;}
  $("maintenance").innerHTML=`<div class="section-head"><h2>Maintenance Requests</h2>${isStaff()?'<button class="btn primary" onclick="openMaintenanceForm()">Submit Request</button>':""}</div>
  <div class="table-wrap"><table><thead><tr><th>Equipment</th><th>Issue</th><th>Requester</th><th>Status</th><th>Action</th></tr></thead><tbody>
  ${data.map(x=>`<tr><td>${esc(x.equipment?.asset_code)} - ${esc(x.equipment?.name)}</td><td>${esc(x.issue)}</td><td>${esc(x.profiles?.full_name)}</td><td><span class="badge">${esc(x.status)}</span></td><td>${isAdmin()&&x.status==="Pending"?`<button class="btn warning" onclick="completeMaintenance('${x.id}')">Mark Completed</button>`:""}</td></tr>`).join("")}</tbody></table></div>`;
}

async function renderUsers(){
  if(!isAdmin()){showView("dashboard");return;}
  const {data,error}=await sb.from("profiles").select("*").order("created_at",{ascending:false});
  if(error){$("users").innerHTML=`<p>${esc(error.message)}</p>`;return;}
  $("users").innerHTML=`<div class="section-head"><h2>Users</h2><button class="btn primary" onclick="openUserForm()">Register User</button></div>
  
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th></tr></thead><tbody>${data.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.email)}</td><td>${esc(x.role)}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join("")}</tbody></table></div>`;
}

async function renderAudit(){
  if(!isAdmin()){showView("dashboard");return;}
  const {data,error}=await sb.from("audit_logs").select("*,profiles(full_name)").order("created_at",{ascending:false}).limit(100);
  if(error){$("audit").innerHTML=`<p>${esc(error.message)}</p>`;return;}
  $("audit").innerHTML=`<h2>Audit Logs</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Module</th><th>Record</th><th>Description</th></tr></thead><tbody>${data.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString()}</td><td>${esc(x.profiles?.full_name)}</td><td>${esc(x.action)}</td><td>${esc(x.module)}</td><td>${esc(x.record_id)}</td><td>${esc(x.description)}</td></tr>`).join("")}</tbody></table></div>`;
}

async function openUserForm(){
  $("appView").insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modal-box"><h2>Register User</h2><form id="userForm">
  <label>Full Name<input id="newName" required></label><label>Email<input id="newEmail" type="email" required></label>
  <label>Temporary Password<input id="newPass" type="password" minlength="8" required></label>
  <label>Role<select id="newRole"><option>Laboratory Staff</option><option>Requester / Viewer</option><option>Administrator</option></select></label>
  <div class="actions"><button class="btn primary">Create User</button><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div>
  <p id="userMsg" class="message"></p></form></div></div>`);
  $("userForm").onsubmit=async e=>{e.preventDefault();$("userMsg").textContent="Creating...";
    const {data:{session}}=await sb.auth.getSession();
    const r=await fetch(`${SUPABASE_URL}/functions/v1/create-user`,{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({email:$("newEmail").value.trim(),password:$("newPass").value,full_name:$("newName").value.trim(),role:$("newRole").value})});
    const out=await r.json(); if(!r.ok){$("userMsg").textContent=out.error||"Could not create user";return;} closeModal(); toast("User registered"); renderUsers();
  };
}

async function openEquipmentForm(){
  $("appView").insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modal-box"><h2>Add Equipment</h2><form id="eqForm"><label>Asset Code<input id="assetCode" required></label><label>Name<input id="assetName" required></label><label>Category<select id="assetCat" required><option value="" disabled selected>Select category</option><option>Computer</option><option>Laptop</option><option>Monitor</option><option>Projector</option><option>Printer</option><option>Microscope</option><option>Laboratory Equipment</option><option>Measuring Instrument</option><option>Electronic Equipment</option><option>Furniture</option><option>Other</option></select></label><label>Location<select id="assetLoc" required><option value="" disabled selected>Select location</option><option>Computer Laboratory 1</option><option>Computer Laboratory 2</option><option>Science Laboratory</option><option>Electronics Laboratory</option><option>Storage Room</option><option>Office</option><option>Other</option></select></label><label id="customLabel" style="display:none">Specify Other<input id="customInput"></label><div class="actions"><button class="btn primary">Add</button><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div></form></div></div>`);

  $("assetCat").onchange=$("assetLoc").onchange=()=>{
    $("customLabel").style.display=$("assetCat").value==="Other"||$("assetLoc").value==="Other"?"block":"none";
  };

  $("eqForm").onsubmit=async e=>{
    e.preventDefault();
    const category=$("assetCat").value==="Other"?$("customInput").value:$("assetCat").value;
    const location=$("assetLoc").value==="Other"?$("customInput").value:$("assetLoc").value;
    const {error}=await sb.from("equipment").insert({asset_code:$("assetCode").value,name:$("assetName").value,category,location});
    if(error)toast(error.message);else{closeModal();toast("Equipment added");renderEquipment();}
  };
}


async function openBorrowForm(){
  const {data}=await sb.from("equipment").select("*").eq("status","Available").order("asset_code");
  $("appView").insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modal-box"><h2>Borrowing Request</h2><form id="borrowForm"><label>Equipment<select id="borrowEq" required>${(data||[]).map(x=>`<option value="${x.id}">${esc(x.asset_code)} - ${esc(x.name)}</option>`).join("")}</select></label><label>Purpose<textarea id="purpose" required></textarea></label><label>Start Date<input id="startDate" type="date" required></label><label>End Date<input id="endDate" type="date" required></label><div class="actions"><button class="btn primary">Submit</button><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div></form></div></div>`);
  $("borrowForm").onsubmit=async e=>{e.preventDefault();const {error}=await sb.from("borrowing_requests").insert({requester_id:currentUser.id,equipment_id:$("borrowEq").value,purpose:$("purpose").value,start_date:$("startDate").value,end_date:$("endDate").value});if(error)toast(error.message);else{closeModal();toast("Request submitted as Pending");renderBorrowing();}};
}
async function openMaintenanceForm(){
  const {data}=await sb.from("equipment").select("*").neq("status","Maintenance").order("asset_code");
  $("appView").insertAdjacentHTML("beforeend",`<div class="modal" id="modal"><div class="modal-box"><h2>Maintenance Request</h2><form id="maintForm"><label>Equipment<select id="maintEq" required>${(data||[]).map(x=>`<option value="${x.id}">${esc(x.asset_code)} - ${esc(x.name)}</option>`).join("")}</select></label><label>Issue<textarea id="issue" required></textarea></label><div class="actions"><button class="btn primary">Submit</button><button type="button" class="btn secondary" onclick="closeModal()">Cancel</button></div></form></div></div>`);
  $("maintForm").onsubmit=async e=>{e.preventDefault();const {error}=await sb.from("maintenance_requests").insert({requester_id:currentUser.id,equipment_id:$("maintEq").value,issue:$("issue").value});if(error)toast(error.message);else{closeModal();toast("Maintenance request submitted");renderMaintenance();}};
}
function closeModal(){document.getElementById("modal")?.remove();}
async function deleteEquipment(id){if(!confirm("Delete this equipment?"))return;const {error}=await sb.from("equipment").delete().eq("id",id);if(error)toast(error.message);else{toast("Equipment deleted");renderEquipment();}}
async function decideRequest(id,status){const {error}=await sb.rpc("approve_or_reject_request",{p_request_id:id,p_status:status});if(error)toast(error.message);else{toast(`Request ${status}`);renderBorrowing();}}
async function releaseRequest(id){const {error}=await sb.rpc("release_request",{p_request_id:id});if(error)toast(error.message);else{toast("Equipment released");renderBorrowing();renderEquipment();}}
async function returnRequest(id){const {error}=await sb.rpc("return_request",{p_request_id:id});if(error)toast(error.message);else{toast("Equipment returned");renderBorrowing();renderEquipment();}}
async function completeMaintenance(id){const {error}=await sb.rpc("complete_maintenance",{p_request_id:id});if(error)toast(error.message);else{toast("Maintenance completed");renderMaintenance();renderEquipment();}}

loadSession();
