import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('browser Supabase client does not override realtime transport', () => {
  const clientSource = readFileSync('src/lib/supabase/client.ts', 'utf8');

  assert.equal(clientSource.includes('transport:'), false);
  assert.equal(clientSource.includes('createRealtimeDiagnosticTransport'), false);
});

test('realtime diagnostics do not persistently monkey-patch Supabase internals', () => {
  const diagnosticsSource = readFileSync(
    'src/lib/supabase/realtimeDiagnostics.ts',
    'utf8'
  );

  assert.equal(diagnosticsSource.includes('.realtime.connect ='), false);
  assert.equal(diagnosticsSource.includes('.realtime.disconnect ='), false);
  assert.equal(diagnosticsSource.includes('supabase.channel ='), false);
  assert.equal(diagnosticsSource.includes('supabase.removeChannel ='), false);
  assert.equal(diagnosticsSource.includes('window.__charlal'), false);
});
