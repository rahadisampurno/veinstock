import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    } else {
      console.log('BROWSER LOG:', msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });

  const email = 'cashier-test-' + Date.now() + '@test.com';
  
  try {
    console.log('1. Logging in as owner...');
    await page.goto('http://localhost:5173');
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'rahadi.sampurno12@gmail.com');
    await page.type('input[type="password"]', 'rahasia');
    await page.click('button.primary.login-submit');
    
    await page.waitForSelector('.workspace b', { timeout: 10000 });
    console.log('Owner logged in successfully.');
    
    console.log('2. Creating cashier user...');
    const token = await page.evaluate(() => localStorage.getItem('veinstock_token'));
    
    const res = await page.evaluate(async (token, email) => {
      const resp = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Test Kasir', email, password: 'password', role: 'cashier', outletId: 'loc-1785071940825' })
      });
      return resp.json();
    }, token, email);
    console.log('Create cashier response:', res);
    
    console.log('3. Logging out...');
    await page.evaluate(() => {
      localStorage.removeItem('veinstock_token');
      localStorage.removeItem('veinstock_user');
      sessionStorage.clear();
    });
    
    console.log('4. Logging in as cashier...');
    await page.goto('http://localhost:5173');
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', 'password');
    await page.click('button.primary.login-submit');
    
    console.log('Waiting 5s to capture infinite loop...');
    await new Promise(r => setTimeout(r, 5000));
    console.log('Test completed.');
  } catch (err) {
    console.error('TEST ERROR:', err);
  } finally {
    await browser.close();
  }
})();
