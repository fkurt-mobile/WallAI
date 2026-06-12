#!/usr/bin/env node
// Apply Upload My Room migration to Supabase using service role key
// Run with: node scripts/apply-migration.cjs

const https = require('https');

const SUPABASE_URL = 'https://coucvckvedgzbdqhysqv.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdWN2Y2t2ZWRnemJkcWh5c3F2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA2MzI3OSwiZXhwIjoyMDk2NjM5Mjc5fQ.B-AUwwqMnUvCGvaGvM8pyhXSU-cINbDNsduj1nkw3KQ';

// We'll use the Supabase REST API with rpc call to run raw SQL
// First check if columns already exist
const checkSql = `
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'visualizations' 
AND column_name IN ('uploaded_room_image_url', 'wall_polygon', 'wall_detection_confidence', 'user_id')
ORDER BY column_name;
`.trim();

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(SUPABASE_URL + path);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Prefer': 'return=representation'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Checking existing columns...');
  
  // Use Supabase's SQL via the REST API (query parameter approach)
  const checkResult = await makeRequest(
    '/rest/v1/visualizations?select=id&limit=1',
    'GET',
    {}
  );
  
  console.log('Current visualizations response:', checkResult.status, JSON.stringify(checkResult.data).substring(0, 200));

  // Try to SELECT the new columns - if they exist, we're done
  const testNewColumns = await makeRequest(
    '/rest/v1/visualizations?select=id,uploaded_room_image_url,wall_polygon,wall_detection_confidence&limit=1',
    'GET',
    {}
  );
  
  if (testNewColumns.status === 200) {
    console.log('✅ Columns already exist! Migration not needed.');
    return;
  }
  
  console.log('Columns do not exist (status:', testNewColumns.status, '). Migration needed.');
  console.log('Error:', JSON.stringify(testNewColumns.data));
}

main().catch(console.error);
