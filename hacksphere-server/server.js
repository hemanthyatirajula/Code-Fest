import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Piston public endpoint (code execution)
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

// Supabase REST configuration (server uses the service_role key)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn("Supabase service key or URL not set. User endpoints will fail until configured (see .env.example).");
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY || "",
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ""}`,
    "Content-Type": "application/json",
  };
}

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, { headers: supabaseHeaders(), ...options });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

// --- User endpoints (CRUD) ---

// Create a user profile
app.post("/api/users", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Supabase not configured" });

  const profile = req.body;
  try {
    const { status, body } = await supabaseRequest("/users", { method: "POST", body: JSON.stringify(profile) });
    return res.status(status).json(body);
  } catch (err) {
    console.error("Error creating user:\n", err);
    return res.status(500).json({ error: "create failed" });
  }
});

// List users
app.get("/api/users", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Supabase not configured" });
  const limit = req.query.limit || 100;
  try {
    const { status, body } = await supabaseRequest(`/users?select=*&limit=${limit}`);
    return res.status(status).json(body);
  } catch (err) {
    console.error("Error listing users:\n", err);
    return res.status(500).json({ error: "list failed" });
  }
});

// Get user by id
app.get("/api/users/:id", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Supabase not configured" });
  const id = req.params.id;
  try {
    const { status, body } = await supabaseRequest(`/users?select=*&id=eq.${id}`);
    return res.status(status).json(body && body.length ? body[0] : null);
  } catch (err) {
    console.error("Error fetching user:\n", err);
    return res.status(500).json({ error: "fetch failed" });
  }
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Supabase not configured" });
  const id = req.params.id;
  const updates = req.body;
  try {
    const { status, body } = await supabaseRequest(`/users?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(updates) });
    return res.status(status).json(body);
  } catch (err) {
    console.error("Error updating user:\n", err);
    return res.status(500).json({ error: "update failed" });
  }
});

// --- Keep existing execution endpoint ---
app.post("/api/execute", async (req, res) => {
  try {
    const { code, language, testCases } = req.body;
    console.log("📨 Request received:");
    console.log("   Language:", language);
    console.log("   Code:", (code || "").substring(0, 100) + "...");
    console.log("   Test Cases:", (testCases || []).length);

    if (!code || !language || !testCases)
      return res.status(400).json({ error: "Missing parameters" });

    const results = [];
    for (const tc of testCases) {
      console.log("\n🧪 Running test case...");
      console.log(`   Input: ${tc.input}`);
      console.log(`   Expected: ${tc.expectedOutput}`);

      const response = await fetch(PISTON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          version: "*",
          files: [{ name: "main", content: code }],
          stdin: tc.input,
        }),
      });

      const data = await response.json();
      const output = data.run?.output?.trim() || "";
      const passed = output === tc.expectedOutput;

      console.log(`   Actual Output: ${output}`);
      console.log(`   Result: ${passed ? "✅ PASSED" : "❌ FAILED"}`);

      results.push({
        input: tc.input,
        expected: tc.expectedOutput,
        output,
        passed,
      });
    }

    const passedCount = results.filter(r => r.passed).length;

    console.log("\n📊 Execution Summary:");
    console.log(`   Passed: ${passedCount}/${testCases.length}`);
    console.log(`   Score: ${passedCount}/${testCases.length}\n`);

    res.json({
      message: "Execution complete",
      results,
      score: `${passedCount}/${testCases.length}`,
    });
  } catch (err) {
    console.error("❌ Error occurred:", err);
    res.status(500).json({ error: "Execution failed" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));