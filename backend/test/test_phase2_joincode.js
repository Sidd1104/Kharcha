const { generateJoinCode } = require('../src/utils/joinCode');

async function testPhase2() {
  console.log('🧪 Starting Phase 2 Join Code Generator Verification...');

  // 1. Generate 50 codes and ensure all are valid 6-digit strings
  const codes = new Set();
  for (let i = 0; i < 50; i++) {
    const code = await generateJoinCode();
    if (!/^\d{6}$/.test(code)) {
      throw new Error(`FAIL: Invalid join code format: ${code}`);
    }
    codes.add(code);
  }
  console.log(`   Generated 50 random join codes; unique count: ${codes.size}`);

  // 2. Test collision retry simulation
  console.log('   Testing collision retry mechanism...');
  let queryCount = 0;
  const mockClient = {
    query: async (sql, params) => {
      queryCount++;
      // Simulate collision on first 2 attempts, then succeed
      if (queryCount <= 2) {
        return { rows: [{ '1': 1 }] }; // collision
      }
      return { rows: [] }; // success
    },
  };

  const codeWithRetry = await generateJoinCode(mockClient);
  if (!/^\d{6}$/.test(codeWithRetry)) {
    throw new Error('FAIL: Expected valid code after retry');
  }
  if (queryCount !== 3) {
    throw new Error(`FAIL: Expected 3 query attempts, got ${queryCount}`);
  }
  console.log(`   Collision retry confirmed: Succeeded on attempt #${queryCount} with code ${codeWithRetry}`);

  // 3. Test retry cap exhaustion
  let exhaustCaught = false;
  const alwaysCollideClient = {
    query: async () => ({ rows: [{ '1': 1 }] }),
  };
  try {
    await generateJoinCode(alwaysCollideClient);
  } catch (err) {
    exhaustCaught = true;
    console.log('   Retries exhaustion confirmed caught:', err.message);
  }
  if (!exhaustCaught) {
    throw new Error('FAIL: Expected exhaustion error when all attempts collide');
  }

  // 4. Test forced low value with leading zero padding
  const crypto = require('crypto');
  const originalRandomInt = crypto.randomInt;
  crypto.randomInt = () => 42;
  const mockClientPass = { query: async () => ({ rows: [] }) };
  const lowCode = await generateJoinCode(mockClientPass);
  crypto.randomInt = originalRandomInt;
  if (lowCode !== '000042') {
    throw new Error(`FAIL: Expected '000042', got '${lowCode}'`);
  }
  console.log(`   Forced low value confirmed: 42 correctly padded to '${lowCode}'`);

  console.log('🎉 Phase 2 Join Code Generator Verification PASSED!');
  process.exit(0);
}

testPhase2().catch((err) => {
  console.error('❌ Phase 2 test failed:', err);
  process.exit(1);
});
