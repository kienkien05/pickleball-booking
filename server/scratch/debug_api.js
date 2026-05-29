async function test() {
  try {
    console.log('--- LOGGING IN ---');
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@pickleball.com', password: 'admin123' }),
    });
    console.log('Login Status:', loginRes.status);
    const loginData = await loginRes.json();
    console.log('Login Data:', JSON.stringify(loginData, null, 2));

    const token = loginData.data?.token;
    if (!token) {
      console.log('No token returned!');
      return;
    }

    console.log('--- CALLING TOGGLE STATUS ---');
    const toggleRes = await fetch('http://localhost:3001/api/users/2/toggle-status', {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      }
    });
    console.log('Toggle Status:', toggleRes.status);
    const toggleData = await toggleRes.json();
    console.log('Toggle Data:', JSON.stringify(toggleData, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
}

test();
